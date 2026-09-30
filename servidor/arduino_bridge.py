"""Pasarela USB–Internet para el servidor físico VoltKey del Arduino UNO R3.

El UNO conserva el estado autoritativo de tarjeta, política y tres relés. El
computador mantiene FastAPI/WebSocket como transporte hacia Internet porque el
USB del UNO R3 es serie, no una interfaz de red autónoma.
"""

from __future__ import annotations

import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

try:
    import serial
    from serial.tools import list_ports
except ImportError:  # La aplicación sigue funcionando aunque pyserial falte.
    serial = None
    list_ports = None


EventHandler = Callable[[dict[str, Any]], Awaitable[None]]


def _enabled(value: str) -> bool:
    return str(value).strip().lower() not in {"0", "false", "no", "off", ""}


class ArduinoBridge:
    """Conexión reconectable con un firmware VoltKey para Arduino UNO R3."""

    PROTOCOL = "VK1"
    MAPPED_CIRCUITS = (1, 2, 3)
    EXPECTED_FIRMWARE = "1.12.0"
    EXPECTED_TEST_VERSION = "1.2"

    def __init__(self) -> None:
        self.enabled = _enabled(os.getenv("VOLTKEY_ARDUINO_ENABLED", "0"))
        self.port_setting = os.getenv("VOLTKEY_ARDUINO_PORT", "auto").strip() or "auto"
        try:
            self.baud = int(os.getenv("VOLTKEY_ARDUINO_BAUD", "115200"))
        except ValueError:
            self.baud = 115200
        self.connection: Any = None
        self.port: str | None = None
        self.device = "Arduino UNO R3"
        self.firmware: str | None = None
        self.test_version: str | None = None
        self.server_role: str | None = None
        self.card_present: bool | None = None
        self.grid_available: bool | None = None
        self.essential_mask: int | None = None
        self.card_delay_seconds: int | None = None
        self.last_sequence: int | None = None
        self.relay_pins = [12, 11, 10]
        self.active_low_mask = 0
        self.card_led_pin = 13
        self.card_led_active_low = False
        self.card_led_outage_blink_ms = 1000
        self.card_led_mode = "steady"
        self.card_led_output: bool | None = True
        self.card_countdown_seconds: int | None = None
        self.link_online: bool | None = None
        self.last_cause: str | None = None
        self.last_self_test: dict[str, Any] | None = None
        self.circuit_states: dict[str, bool] = {}
        self.relay_indicator_states: dict[str, bool] = {}
        self.last_seen: str | None = None
        self.last_error: str | None = None
        self._buffer = bytearray()
        self._stop = False
        self._handler: EventHandler | None = None
        self._pending_set_commands: dict[str, asyncio.Future[Any]] = {}
        self._pending_card_commands: dict[str, tuple[bool, asyncio.Future[Any]]] = {}
        self._pending_grid_commands: dict[str, tuple[bool, asyncio.Future[Any]]] = {}
        self._pending_relay_config: asyncio.Future[Any] | None = None
        self._pending_card_led_config: asyncio.Future[Any] | None = None
        self._last_probe = 0.0
        self._last_ping = 0.0

    @property
    def connected(self) -> bool:
        return self.connection is not None and bool(getattr(self.connection, "is_open", False))

    @property
    def compatible(self) -> bool:
        return self.connected and self.firmware == self.EXPECTED_FIRMWARE and self.test_version == self.EXPECTED_TEST_VERSION

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "connected": self.connected,
            "compatible": self.compatible,
            "device": self.device,
            "firmware": self.firmware,
            "serverRole": self.server_role,
            "port": self.port,
            "baud": self.baud,
            "lastSeen": self.last_seen,
            "error": self.last_error,
            "mappedCircuitIds": list(self.MAPPED_CIRCUITS),
            "mode": "usb-internet-gateway",
            "authority": "arduino-uno-r3",
            "internetTransport": "computer-usb-gateway",
            "testVersion": self.test_version,
            "cardLedPin": self.card_led_pin,
            "cardLedActiveLow": self.card_led_active_low,
            "cardLedOutageBlinkMs": self.card_led_outage_blink_ms,
            "cardLedBlinkMs": self.card_led_outage_blink_ms,
            "cardLedMode": self.card_led_mode,
            "cardLedOutput": self.card_led_output,
            "cardCountdownSeconds": self.card_countdown_seconds,
            "cardPresent": self.card_present,
            "gridAvailable": self.grid_available,
            "essentialMask": self.essential_mask,
            "cardDelaySeconds": self.card_delay_seconds,
            "serverSequence": self.last_sequence,
            "circuitStates": dict(self.circuit_states),
            "relayIndicatorStates": dict(self.relay_indicator_states or self.circuit_states),
            "circuitPinMap": {str(index + 1): pin for index, pin in enumerate(self.relay_pins)},
            "activeLowMask": self.active_low_mask,
            "linkOnline": self.link_online,
            "lastCause": self.last_cause,
            "lastSelfTest": self.last_self_test,
            "prototypeLabels": ["General", "1er piso", "2do piso"],
        }

    def _candidate_ports(self) -> list[str]:
        if list_ports is None:
            return []
        ports = list(list_ports.comports())
        if self.port_setting.lower() != "auto":
            return [self.port_setting]

        def score(item: Any) -> int:
            haystack = " ".join(str(value or "") for value in (
                item.device, item.description, item.manufacturer, item.product, item.hwid,
            )).lower()
            value = 0
            if "arduino" in haystack or "uno" in haystack:
                value += 100
            if "ch340" in haystack or "usb serial" in haystack or "cp210" in haystack:
                value += 60
            if getattr(item, "vid", None) in {0x2341, 0x2A03}:
                value += 120
            if "bluetooth" in haystack:
                value -= 200
            return value

        likely = [item for item in ports if score(item) > 0]
        if likely:
            return [str(item.device) for item in sorted(likely, key=lambda item: (-score(item), str(item.device)))]
        # Si Windows solo expone un puerto no identificado, permite probarlo.
        if len(ports) == 1 and "bluetooth" not in str(ports[0].description or "").lower():
            return [str(ports[0].device)]
        self.last_error = "No se encontró un puerto USB compatible con Arduino/CH340/CP210x."
        return []

    async def _connect(self) -> None:
        if not self.enabled or serial is None:
            if self.enabled and serial is None:
                self.last_error = "Falta pyserial; ejecuta pip install -r servidor/requirements.txt."
            return
        for candidate in self._candidate_ports():
            try:
                connection = serial.Serial(candidate, self.baud, timeout=0, write_timeout=0.5)
                self.connection = connection
                self.port = candidate
                self.last_error = None
                self._buffer.clear()
                # Abrir el puerto suele reiniciar el UNO. Esperamos su bootloader.
                connection.reset_input_buffer()
                await asyncio.sleep(2.1)
                await self.send("PING", str(int(time.time())))
                await self.request_state()
                return
            except Exception as error:
                self.last_error = f"{candidate}: {error}"[:240]
                self.connection = None
                self.port = None

    def _disconnect(self, error: Exception | str | None = None) -> None:
        if error:
            self.last_error = str(error)[:240]
        connection, self.connection = self.connection, None
        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass
        for future in self._pending_set_commands.values():
            if not future.done():
                future.set_result(None)
        self._pending_set_commands.clear()
        for _, future in self._pending_card_commands.values():
            if not future.done(): future.set_result(None)
        self._pending_card_commands.clear()
        for _, future in self._pending_grid_commands.values():
            if not future.done(): future.set_result(None)
        self._pending_grid_commands.clear()
        for future in (self._pending_relay_config, self._pending_card_led_config):
            if future is not None and not future.done():
                future.set_result(False)
        self._pending_relay_config = None
        self._pending_card_led_config = None

    async def send(self, command: str, *fields: Any) -> bool:
        if not self.connected:
            return False
        clean_fields = [str(field).replace("|", "/").replace("\r", " ").replace("\n", " ") for field in fields]
        line = "|".join((self.PROTOCOL, command.upper(), *clean_fields)) + "\n"
        try:
            self.connection.write(line.encode("ascii", errors="replace"))
            return True
        except Exception as error:
            self._disconnect(error)
            return False

    async def set_circuit(self, circuit_id: Any, on: bool, command_id: Any = "") -> bool:
        if str(circuit_id) not in {str(value) for value in self.MAPPED_CIRCUITS}:
            return False
        token = str(command_id or f"set-{time.monotonic_ns()}")[:120]
        future = asyncio.get_running_loop().create_future()
        previous = self._pending_set_commands.pop(token, None)
        if previous is not None and not previous.done():
            previous.set_result(None)
        self._pending_set_commands[token] = future
        if not await self.send("SET", circuit_id, 1 if on else 0, token):
            self._pending_set_commands.pop(token, None)
            return False
        try:
            actual = await asyncio.wait_for(future, timeout=2.0)
            if actual is None or bool(actual) != bool(on):
                self.last_error = f"El Arduino confirmó el circuito {circuit_id} en un estado distinto al solicitado."
                return False
            self.last_error = None
            return True
        except TimeoutError:
            self.last_error = f"El Arduino no confirmó el circuito {circuit_id} dentro de 2 segundos."
            await self.request_state()
            return False
        finally:
            self._pending_set_commands.pop(token, None)

    async def set_card(self, inserted: bool, command_id: Any = "") -> bool:
        token = str(command_id or f"card-{time.monotonic_ns()}")[:120]
        future = asyncio.get_running_loop().create_future()
        previous = self._pending_card_commands.pop(token, None)
        if previous is not None and not previous[1].done(): previous[1].set_result(None)
        self._pending_card_commands[token] = (bool(inserted), future)
        if not await self.send("CARDSET", 1 if inserted else 0, token):
            self._pending_card_commands.pop(token, None); return False
        try:
            for attempt in range(2):
                try:
                    actual = await asyncio.wait_for(asyncio.shield(future), timeout=1.5)
                    if actual is None or bool(actual) != bool(inserted):
                        self.last_error = "El Arduino confirmó un estado de tarjeta distinto al solicitado."; return False
                    self.last_error = None; return True
                except TimeoutError:
                    if attempt == 0: await self.request_state()
            self.last_error = "El Arduino no confirmó el cambio de tarjeta; se solicitó nuevamente su estado físico."; return False
        finally:
            self._pending_card_commands.pop(token, None)

    async def set_grid(self, available: bool, command_id: Any = "") -> bool:
        token = str(command_id or f"grid-{time.monotonic_ns()}")[:120]
        future = asyncio.get_running_loop().create_future()
        previous = self._pending_grid_commands.pop(token, None)
        if previous is not None and not previous[1].done(): previous[1].set_result(None)
        self._pending_grid_commands[token] = (bool(available), future)
        if not await self.send("GRIDSET", 1 if available else 0, token):
            self._pending_grid_commands.pop(token, None); return False
        try:
            for attempt in range(2):
                try:
                    actual = await asyncio.wait_for(asyncio.shield(future), timeout=1.5)
                    if actual is None or bool(actual) != bool(available):
                        self.last_error = "El Arduino confirmó un estado de red distinto al solicitado."; return False
                    self.last_error = None; return True
                except TimeoutError:
                    if attempt == 0: await self.request_state()
            self.last_error = "El Arduino no confirmó el estado de red dentro del tiempo esperado."; return False
        finally:
            self._pending_grid_commands.pop(token, None)

    async def configure_policy(self, circuits: list[dict[str, Any]], delay_seconds: int = 5) -> bool:
        essential_mask = 0
        for circuit in circuits:
            try:
                circuit_id = int(circuit.get("id"))
            except (TypeError, ValueError):
                continue
            if 1 <= circuit_id <= 3 and circuit.get("essential"):
                essential_mask |= 1 << (circuit_id - 1)
        safe_delay = max(0, min(60, int(delay_seconds)))
        if self.essential_mask == essential_mask and self.card_delay_seconds == safe_delay:
            return True
        return await self.send("POLICY", essential_mask, safe_delay)

    async def configure_relay(self, slot: int, pin: int, active_low: bool) -> bool:
        if slot not in self.MAPPED_CIRCUITS or pin < 2 or pin > 12 or pin == self.card_led_pin:
            return False
        previous = self._pending_relay_config
        if previous is not None and not previous.done():
            previous.set_result(False)
        future = asyncio.get_running_loop().create_future()
        self._pending_relay_config = future
        if not await self.send("RELAYCFG", slot, pin, 1 if active_low else 0):
            self._pending_relay_config = None
            return False
        try:
            return bool(await asyncio.wait_for(future, timeout=2.0))
        except TimeoutError:
            self.last_error = "El Arduino no confirmó la configuración del relé dentro de 2 segundos."
            await self.request_state()
            return False
        finally:
            if self._pending_relay_config is future:
                self._pending_relay_config = None

    async def test_relay(self, slot: int, duration_ms: int = 250, command_id: str = "") -> bool:
        if slot not in self.MAPPED_CIRCUITS:
            return False
        return await self.send("TESTRELAY", slot, max(50, min(1000, int(duration_ms))), command_id or "test")

    async def configure_card_led(self, pin: int, active_low: bool, outage_blink_ms: int) -> bool:
        if pin < 2 or pin > 13 or pin in self.relay_pins:
            return False
        safe_blink_ms = max(200, min(2000, int(outage_blink_ms)))
        previous = self._pending_card_led_config
        if previous is not None and not previous.done():
            previous.set_result(False)
        future = asyncio.get_running_loop().create_future()
        self._pending_card_led_config = future
        if not await self.send("CARDLEDCFG", pin, 1 if active_low else 0, safe_blink_ms):
            self._pending_card_led_config = None
            return False
        try:
            return bool(await asyncio.wait_for(future, timeout=2.0))
        except TimeoutError:
            self.last_error = "El Arduino no confirmó la configuración del indicador dentro de 2 segundos."
            await self.request_state()
            return False
        finally:
            if self._pending_card_led_config is future:
                self._pending_card_led_config = None

    async def test_card_led(self, duration_ms: int = 250, command_id: str = "") -> bool:
        return await self.send("TESTCARDLED", max(50, min(1000, int(duration_ms))), command_id or "card-led-test")

    async def self_test(self, command_id: str = "") -> bool:
        return await self.send("SELFTEST", command_id or "selftest")

    async def emergency_stop(self, command_id: str = "") -> bool:
        return await self.send("ESTOP", command_id or "emergency")

    async def request_state(self) -> bool:
        return await self.send("STATE")

    async def reconcile_circuits(self, circuits: list[dict[str, Any]], command_prefix: str = "gateway") -> bool:
        """Solicita al servidor Arduino solo los cambios físicos pendientes."""
        success = True
        for circuit in circuits:
            circuit_id = str(circuit.get("id"))
            if circuit_id not in {str(value) for value in self.MAPPED_CIRCUITS}:
                continue
            desired = bool(circuit.get("on"))
            if self.circuit_states.get(circuit_id) == desired:
                continue
            sent = await self.set_circuit(circuit_id, desired, f"{command_prefix}-{circuit_id}")
            success = success and sent
        return success

    async def _emit(self, event: dict[str, Any]) -> None:
        self.last_seen = datetime.now(timezone.utc).isoformat()
        if self._handler:
            await self._handler(event)

    async def _handle_line(self, line: str) -> None:
        parts = [part.strip() for part in line.strip().split("|")]
        if len(parts) < 2 or parts[0] != self.PROTOCOL:
            return
        command = parts[1].upper()
        if command == "HELLO":
            self.firmware = parts[2] if len(parts) > 2 else None
            self.server_role = parts[4] if len(parts) > 4 else None
            self.test_version = parts[5] if len(parts) > 5 else None
            await self._emit({
                "type": "hello", "firmware": self.firmware,
                "outputs": parts[3] if len(parts) > 3 else None,
                "serverRole": self.server_role,
                "testVersion": self.test_version,
            })
        elif command == "STATE" and len(parts) > 2:
            states: dict[str, bool] = {}
            for item in parts[2].split(","):
                if ":" not in item:
                    continue
                key, value = item.split(":", 1)
                if key.strip().isdigit():
                    states[key.strip()] = value.strip() == "1"
            self.circuit_states = dict(states)
            metadata: dict[str, str] = {}
            for item in parts[3:]:
                if ":" in item:
                    key, value = item.split(":", 1)
                    metadata[key.strip().upper()] = value.strip()
            self.card_present = metadata.get("CARD") == "1" if "CARD" in metadata else self.card_present
            self.grid_available = metadata.get("GRID") == "1" if "GRID" in metadata else self.grid_available
            try:
                self.essential_mask = int(metadata["ESS"]) if "ESS" in metadata else self.essential_mask
                self.card_delay_seconds = int(metadata["DELAY"]) if "DELAY" in metadata else self.card_delay_seconds
                self.last_sequence = int(metadata["SEQ"]) if "SEQ" in metadata else self.last_sequence
                self.active_low_mask = int(metadata["ALOW"]) if "ALOW" in metadata else self.active_low_mask
                if "RLED" in metadata:
                    indicator_mask = int(metadata["RLED"]) & 7
                    self.relay_indicator_states = {
                        str(index + 1): bool(indicator_mask & (1 << index)) for index in range(3)
                    }
            except ValueError:
                self.last_error = "El servidor Arduino envió metadatos de estado no válidos."
            if "MAP" in metadata:
                try:
                    pins = [int(value) for value in metadata["MAP"].split(",")]
                    if len(pins) == 3:
                        self.relay_pins = pins
                except ValueError:
                    self.last_error = "El mapa de relés enviado por Arduino no es válido."
            if "CLED" in metadata:
                try:
                    card_led = metadata["CLED"].split(",")
                    if len(card_led) == 5:
                        self.card_led_pin = int(card_led[0])
                        self.card_led_active_low = card_led[1] == "1"
                        if card_led[4] in {"steady", "outage_blink", "countdown_blink", "off"}:
                            self.card_led_outage_blink_ms = int(card_led[2]); self.card_led_output = card_led[3] == "1"; self.card_led_mode = card_led[4]
                        else:
                            self.card_led_outage_blink_ms = int(card_led[3]); self.card_led_output = card_led[4] == "1"; self.card_led_mode = "steady" if self.card_present else "off"
                except ValueError:
                    self.last_error = "La configuración del indicador de tarjeta no es válida."
            if "CDOWN" in metadata:
                try:
                    countdown = int(metadata["CDOWN"]); self.card_countdown_seconds = countdown if countdown >= 0 else None
                except ValueError: self.card_countdown_seconds = None
            for expected, future in list(self._pending_card_commands.values()):
                if not future.done() and self.card_present is not None and bool(self.card_present) == expected: future.set_result(self.card_present)
            for expected, future in list(self._pending_grid_commands.values()):
                if not future.done() and self.grid_available is not None and bool(self.grid_available) == expected: future.set_result(self.grid_available)
            self.link_online = metadata.get("LINK") == "1" if "LINK" in metadata else self.link_online
            self.last_cause = metadata.get("CAUSE") or self.last_cause
            await self._emit({
                "type": "state", "circuits": states,
                "cardInserted": self.card_present,
                "gridAvailable": self.grid_available,
                "essentialMask": self.essential_mask,
                "delaySeconds": self.card_delay_seconds,
                "sequence": self.last_sequence,
                "relayPins": list(self.relay_pins),
                "activeLowMask": self.active_low_mask,
                "cardLed": {
                    "pin": self.card_led_pin,
                    "activeLow": self.card_led_active_low,
                    "outageBlinkMs": self.card_led_outage_blink_ms,
                    "blinkMs": self.card_led_outage_blink_ms,
                    "mode": self.card_led_mode,
                    "output": self.card_led_output,
                },
                "countdownSeconds": self.card_countdown_seconds,
                "linkOnline": self.link_online,
                "cause": self.last_cause,
            })
        elif command == "ACK" and len(parts) >= 5:
            self.circuit_states[parts[2]] = parts[3] == "1"
            self.relay_indicator_states[parts[2]] = parts[3] == "1"
            pending = self._pending_set_commands.get(parts[4])
            if pending is not None and not pending.done():
                pending.set_result(parts[3] == "1")
            await self._emit({
                "type": "ack", "circuitId": parts[2], "on": parts[3] == "1", "commandId": parts[4],
            })
        elif command == "CARDACK" and len(parts) >= 4:
            self.card_present = parts[2] == "1"
            pending = self._pending_card_commands.get(parts[3])
            if pending is not None and not pending[1].done(): pending[1].set_result(self.card_present)
            await self._emit({
                "type": "card_ack", "value": self.card_present, "commandId": parts[3],
            })
        elif command == "GRIDACK" and len(parts) >= 4:
            self.grid_available = parts[2] == "1"
            pending = self._pending_grid_commands.get(parts[3])
            if pending is not None and not pending[1].done(): pending[1].set_result(self.grid_available)
            await self._emit({"type": "grid_ack", "value": self.grid_available, "commandId": parts[3]})
        elif command == "CARD" and len(parts) > 2:
            await self._emit({"type": "card", "value": parts[2] == "1"})
        elif command == "GRID" and len(parts) > 2:
            await self._emit({"type": "grid", "value": parts[2] == "1"})
        elif command == "TOGGLE" and len(parts) > 2:
            await self._emit({"type": "toggle", "circuitId": parts[2]})
        elif command == "PONG":
            await self._emit({"type": "pong", "nonce": parts[2] if len(parts) > 2 else None})
        elif command == "CFGACK":
            ok = len(parts) > 2 and parts[2] == "1"
            if self._pending_relay_config is not None and not self._pending_relay_config.done():
                self._pending_relay_config.set_result(ok)
            await self._emit({"type": "relay_config", "ok": ok})
        elif command == "CARDLEDCFGACK":
            ok = len(parts) > 2 and parts[2] == "1"
            if self._pending_card_led_config is not None and not self._pending_card_led_config.done():
                self._pending_card_led_config.set_result(ok)
            await self._emit({"type": "card_led_config", "ok": ok})
        elif command == "TESTACK":
            await self._emit({"type": "relay_test", "slot": parts[2] if len(parts) > 2 else None, "commandId": parts[3] if len(parts) > 3 else None})
        elif command == "CARDLEDTESTACK":
            await self._emit({"type": "card_led_test", "commandId": parts[2] if len(parts) > 2 else None})
        elif command == "SELFTEST":
            checks: dict[str, bool] = {}
            for item in parts[3:-1]:
                if ":" in item:
                    key, value = item.split(":", 1)
                    checks[key.lower()] = value == "1"
            self.last_self_test = {"ok": len(parts) > 2 and parts[2] == "1", "checks": checks, "at": datetime.now(timezone.utc).isoformat()}
            await self._emit({"type": "self_test", **self.last_self_test, "commandId": parts[-1] if len(parts) > 3 else None})
        elif command == "ESTOPACK":
            await self._emit({"type": "emergency_stop", "commandId": parts[2] if len(parts) > 2 else None})

    async def _poll(self) -> None:
        if not self.connected:
            return
        try:
            waiting = int(getattr(self.connection, "in_waiting", 0) or 0)
            if waiting:
                self._buffer.extend(self.connection.read(min(waiting, 512)))
            while b"\n" in self._buffer:
                raw, _, remainder = self._buffer.partition(b"\n")
                self._buffer = bytearray(remainder)
                await self._handle_line(raw.decode("ascii", errors="ignore"))
            if len(self._buffer) > 512:
                self._buffer.clear()
                self.last_error = "El Arduino envió una línea demasiado extensa."
        except Exception as error:
            self._disconnect(error)

    async def run(self, handler: EventHandler) -> None:
        self._handler = handler
        self._stop = False
        while not self._stop:
            if not self.enabled:
                await asyncio.sleep(1)
                continue
            if not self.connected and time.monotonic() - self._last_probe >= 2:
                self._last_probe = time.monotonic()
                await self._connect()
            await self._poll()
            if self.connected and time.monotonic() - self._last_ping >= 5:
                self._last_ping = time.monotonic()
                await self.send("PING", str(int(time.time())))
            await asyncio.sleep(0.05)

    async def stop(self) -> None:
        self._stop = True
        self._disconnect()
