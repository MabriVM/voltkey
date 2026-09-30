from __future__ import annotations

import importlib.util
import asyncio
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest


if importlib.util.find_spec("fastapi") is None:
    fastapi = types.ModuleType("fastapi")

    class FastAPI:
        def __init__(self, *args, **kwargs) -> None:
            pass

        def add_middleware(self, *args, **kwargs) -> None:
            pass

        def get(self, *args, **kwargs):
            return lambda function: function

        def websocket(self, *args, **kwargs):
            return lambda function: function

    class HTTPException(Exception):
        pass

    class WebSocket:
        pass

    class WebSocketDisconnect(Exception):
        pass

    fastapi.FastAPI = FastAPI
    fastapi.HTTPException = HTTPException
    fastapi.Query = lambda default="", **kwargs: default
    fastapi.WebSocket = WebSocket
    fastapi.WebSocketDisconnect = WebSocketDisconnect
    middleware = types.ModuleType("fastapi.middleware")
    cors = types.ModuleType("fastapi.middleware.cors")
    cors.CORSMiddleware = object
    sys.modules["fastapi"] = fastapi
    sys.modules["fastapi.middleware"] = middleware
    sys.modules["fastapi.middleware.cors"] = cors

os.environ.setdefault("VOLTKEY_ARDUINO_REQUIRED", "1")
os.environ.setdefault("VOLTKEY_ARDUINO_ENABLED", "1")
os.environ.setdefault("VOLTKEY_SEED_DEMO_HISTORY", "0")

from servidor import voltkey_server as server  # noqa: E402


class FakeManager:
    def __init__(self) -> None:
        self.clients = {}
        self.messages: list[dict] = []

    async def send(self, websocket, message: dict) -> None:
        self.messages.append(message)

    async def broadcast(self, message: dict) -> None:
        self.messages.append(message)

    async def broadcast_presence(self) -> None:
        pass


class FakeSerial:
    def __init__(self) -> None:
        self.is_open = True
        self.writes: list[bytes] = []

    def write(self, payload: bytes) -> int:
        self.writes.append(payload)
        return len(payload)

    def close(self) -> None:
        self.is_open = False


class ArduinoAuthorityTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = FakeManager()
        server.MANAGER = self.manager
        server.STATE = server.initial_state()
        server.save_state = lambda: None
        server.ARDUINO_REQUIRED = True
        server.ARDUINO_BRIDGE.connection = None
        server.ARDUINO_BRIDGE.circuit_states = {}
        server.ARDUINO_BRIDGE.relay_pins = [12, 11, 10]
        server.ARDUINO_BRIDGE.card_led_pin = 13
        server.ARDUINO_BRIDGE.firmware = "1.12.0"
        server.ARDUINO_BRIDGE.test_version = "1.2"

    async def test_arduino_test_catalog_has_only_three_physical_slots(self) -> None:
        catalog = server.enforce_arduino_test_catalog([
            {"id": 1, "name": "General editado", "power": 50, "on": True},
            {"id": 4, "name": "Circuito antiguo", "power": 900, "on": True},
        ])
        self.assertEqual([item["id"] for item in catalog], [1, 2, 3])
        self.assertEqual(catalog[0]["name"], "General editado")
        self.assertEqual(catalog[1]["name"], "1ER PISO")
        self.assertEqual(server.initial_state()["arduinoTestEdition"], "1.2")

    async def test_snapshot_from_arduino_overrides_physical_state(self) -> None:
        await server.handle_arduino_event({
            "type": "state",
            "circuits": {"1": False, "2": False, "3": False},
            "cardInserted": False,
            "gridAvailable": True,
            "essentialMask": 1,
            "delaySeconds": 5,
            "sequence": 9,
        })
        self.assertFalse(server.circuit_by_id(1)["on"])
        self.assertTrue(server.circuit_by_id(1)["essential"])
        self.assertFalse(server.circuit_by_id(2)["essential"])
        self.assertFalse(server.STATE["cardInserted"])
        self.assertEqual(server.STATE["arduinoServerSequence"], 9)
        self.assertEqual(self.manager.messages[-1]["reason"], "arduino_authoritative_state")

    async def test_offline_arduino_rejects_false_physical_change(self) -> None:
        before = bool(server.circuit_by_id(1)["on"])
        await server.handle_message(object(), {
            "type": "set_circuit",
            "id": 1,
            "on": not before,
            "profileId": "family-admin",
            "source": "test",
            "commandId": "offline-1",
            "edition": server.EDITION,
        })
        self.assertEqual(bool(server.circuit_by_id(1)["on"]), before)
        self.assertEqual(self.manager.messages[-1]["type"], "command_error")
        self.assertIn("desconectado", self.manager.messages[-1]["message"])

    async def test_online_card_command_is_sent_to_arduino(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        command = asyncio.create_task(server.handle_message(object(), {
            "type": "set_card",
            "inserted": False,
            "profileId": "family-admin",
            "source": "test",
            "commandId": "card-test",
            "delaySeconds": 5,
            "edition": server.EDITION,
        }))
        await asyncio.sleep(0)
        self.assertIn(b"VK1|CARDSET|0|card-test\n", serial.writes)
        await server.ARDUINO_BRIDGE._handle_line("VK1|CARDACK|0|card-test")
        await command
        self.assertFalse(server.STATE["cardInserted"])

    async def test_grid_state_changes_only_after_arduino_confirmation(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        command = asyncio.create_task(server.handle_message(object(), {
            "type": "set_grid", "available": False, "profileId": "family-admin",
            "source": "test", "commandId": "grid-test", "edition": server.EDITION,
        }))
        await asyncio.sleep(0)
        self.assertIn(b"VK1|GRIDSET|0|grid-test\n", serial.writes)
        self.assertTrue(server.STATE["gridAvailable"])
        await server.ARDUINO_BRIDGE._handle_line("VK1|GRIDACK|0|grid-test")
        await command
        self.assertFalse(server.STATE["gridAvailable"])

    async def test_load_state_migrates_1_1_without_losing_pin_configuration(self) -> None:
        previous_path = server.STATE_PATH
        with tempfile.TemporaryDirectory() as directory:
            server.STATE_PATH = Path(directory) / "state.json"
            server.STATE_PATH.write_text(json.dumps({
                "arduinoTestEdition": "1.1",
                "circuits": [
                    {"id": 1, "name": "GENERAL PERSONALIZADO", "on": True},
                    {"id": 2, "name": "PISO A", "on": False},
                    {"id": 3, "name": "PISO B", "on": False},
                ],
                "hardwarePrototype": {
                    "relayPins": [7, 8, 9], "activeLowMask": 2,
                    "cardLed": {"pin": 13, "activeLow": True, "absentMode": "blink", "blinkMs": 500},
                },
            }), encoding="utf-8")
            try:
                restored = server.load_state()
            finally:
                server.STATE_PATH = previous_path
        self.assertEqual(restored["arduinoTestEdition"], "1.2")
        self.assertEqual(restored["circuits"][0]["name"], "GENERAL PERSONALIZADO")
        self.assertEqual(restored["hardwarePrototype"]["relayPins"], [7, 8, 9])
        self.assertEqual(restored["hardwarePrototype"]["cardLed"]["outageBlinkMs"], 500)
        self.assertTrue(restored["hardwarePrototype"]["cardLed"]["activeLow"])

    async def test_general_is_master_for_floor_outputs(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        server.circuit_by_id(1)["on"] = False
        server.circuit_by_id(2)["on"] = False
        await server.handle_message(object(), {
            "type": "set_circuit", "id": 2, "on": True,
            "profileId": "family-admin", "source": "test", "commandId": "floor-test",
            "edition": server.EDITION,
        })
        self.assertFalse(server.circuit_by_id(2)["on"])
        self.assertEqual(self.manager.messages[-1]["type"], "command_error")
        self.assertNotIn(b"VK1|SET|2|1|floor-test\n", serial.writes)

    async def test_app_state_changes_only_after_relay_led_confirmation(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        server.circuit_by_id(1)["on"] = True
        server.circuit_by_id(2)["on"] = False
        command = asyncio.create_task(server.handle_message(object(), {
            "type": "set_circuit", "id": 2, "on": True,
            "profileId": "family-admin", "source": "test", "commandId": "relay-led-2",
            "edition": server.EDITION,
        }))
        await asyncio.sleep(0)
        self.assertIn(b"VK1|SET|2|1|relay-led-2\n", serial.writes)
        self.assertFalse(server.circuit_by_id(2)["on"])
        await server.ARDUINO_BRIDGE._handle_line("VK1|ACK|2|1|relay-led-2")
        await command
        self.assertTrue(server.circuit_by_id(2)["on"])
        self.assertTrue(server.ARDUINO_BRIDGE.status()["relayIndicatorStates"]["2"])

    async def test_emergency_stop_preserves_essential_output(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        server.circuit_by_id(1)["essential"] = True
        server.circuit_by_id(2)["essential"] = False
        server.circuit_by_id(1)["on"] = True
        server.circuit_by_id(2)["on"] = True
        await server.handle_message(object(), {
            "type": "emergency_stop", "profileId": "family-admin", "source": "test", "commandId": "stop-test", "edition": server.EDITION,
        })
        self.assertTrue(server.circuit_by_id(1)["on"])
        self.assertFalse(server.circuit_by_id(2)["on"])
        self.assertIn(b"VK1|ESTOP|stop-test\n", serial.writes)

    async def test_card_led_configuration_is_sent_and_persisted(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        command = asyncio.create_task(server.handle_message(object(), {
            "type": "set_card_led_config", "pin": 9, "activeLow": True,
            "outageBlinkMs": 500,
            "profileId": "family-admin", "source": "test", "edition": server.EDITION,
        }))
        await asyncio.sleep(0)
        self.assertIn(b"VK1|CARDLEDCFG|9|1|500\n", serial.writes)
        await server.ARDUINO_BRIDGE._handle_line("VK1|CARDLEDCFGACK|1")
        await command
        config = server.STATE["hardwarePrototype"]["cardLed"]
        self.assertEqual(config["pin"], 9)
        self.assertTrue(config["activeLow"])
        self.assertEqual(config["outageBlinkMs"], 500)

    async def test_old_arduino_test_firmware_must_be_updated_before_configuration(self) -> None:
        serial = FakeSerial()
        server.ARDUINO_BRIDGE.connection = serial
        server.ARDUINO_BRIDGE.test_version = "1.1"
        await server.handle_message(object(), {
            "type": "set_card_led_config", "pin": 9, "activeLow": False,
            "outageBlinkMs": 1000,
            "profileId": "family-admin", "source": "test", "edition": server.EDITION,
        })
        self.assertEqual(serial.writes, [])
        self.assertEqual(self.manager.messages[-1]["type"], "command_error")
        self.assertIn("Actualizar-Arduino.cmd", self.manager.messages[-1]["message"])


if __name__ == "__main__":
    unittest.main()
