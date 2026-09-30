"""Prueba guiada del firmware VoltKey en Arduino UNO R3."""

from __future__ import annotations

import asyncio
import os
import sys
import time

os.environ.setdefault("VOLTKEY_ARDUINO_ENABLED", "1")
os.environ.setdefault("VOLTKEY_ARDUINO_PORT", "auto")

from servidor.arduino_bridge import ArduinoBridge  # noqa: E402


async def main() -> int:
    bridge = ArduinoBridge()
    events: asyncio.Queue[dict] = asyncio.Queue()

    async def receive(event: dict) -> None:
        await events.put(event)

    async def wait_state(predicate, timeout: float = 3.0) -> dict | None:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(events.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if event.get("type") == "state" and predicate(event):
                return event
        return None

    task = asyncio.create_task(bridge.run(receive))
    print("\n[VOLTKEY] Buscando Arduino UNO R3 por USB...")
    try:
        deadline = time.monotonic() + 15
        hello = None
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(events.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if event.get("type") == "hello":
                hello = event
                break
        if not hello:
            status = bridge.status()
            print("[ERROR] No se recibio el saludo del Arduino.")
            print(f"        Puerto: {status.get('port') or 'no detectado'}")
            print(f"        Detalle: {status.get('error') or 'sin respuesta'}")
            print("        Comprueba el firmware, el cable USB y cierra el Monitor Serie.")
            return 1

        print(f"[OK] Arduino detectado en {bridge.port}")
        print(f"[OK] Firmware VoltKey {hello.get('firmware')}")
        if hello.get("firmware") != "1.12.0":
            print("[ERROR] El firmware no coincide con la base 1.12.0 de ARDUINO TEST 1.2.")
            return 1
        if hello.get("testVersion") != "1.2":
            print("[ERROR] El firmware no incluye los estados de tarjeta de ARDUINO TEST 1.2.")
            return 1
        if hello.get("serverRole") != "UNO-SERVER-USB":
            print("[ERROR] El firmware no corresponde al servidor fisico USB.")
            return 1
        print("[OK] El Arduino se identifico como servidor fisico autoritativo.")

        await bridge.request_state()
        state_event = None
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(events.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if event.get("type") == "state":
                state_event = event
                break
        if not state_event:
            print("[ERROR] El Arduino no entrego su mapa de salidas.")
            return 1

        card_led_status = bridge.status()
        print(f"[OK] Indicador de tarjeta en D{card_led_status.get('cardLedPin')} · tarjeta presente = encendido fijo.")
        print("[PRUEBA] Simulando tarjeta retirada: debe parpadear cada 1 segundo durante la cuenta regresiva...")
        if not await bridge.set_card(False, "prueba-tarjeta-fuera"):
            print(f"[ERROR] El Arduino no confirmo la tarjeta retirada: {bridge.last_error or 'sin estado autoritativo'}")
            return 1
        removed_state = await wait_state(lambda event: event.get("cardInserted") is False and (event.get("cardLed") or {}).get("mode") == "countdown_blink")
        if not removed_state:
            print("[ERROR] La tarjeta se retiró, pero el Arduino no informó el modo de parpadeo de cuenta regresiva.")
            return 1
        print("[OK] Tarjeta retirada y cuenta regresiva confirmadas. Esperando el apagado final...")
        finished_state = await wait_state(lambda event: event.get("cardInserted") is False and (event.get("cardLed") or {}).get("mode") == "off", timeout=7.0)
        if not finished_state:
            print("[ERROR] Terminó el tiempo esperado, pero el Arduino no confirmó el indicador apagado.")
            return 1
        print("[OK] Cuenta regresiva terminada; indicador apagado.")

        print("[PRUEBA] Simulando tarjeta insertada: el indicador debe quedar encendido...")
        if not await bridge.set_card(True, "prueba-tarjeta-dentro"):
            print(f"[ERROR] El Arduino no confirmo la tarjeta insertada: {bridge.last_error or 'sin estado autoritativo'}")
            return 1
        inserted_state = await wait_state(lambda event: event.get("cardInserted") is True and (event.get("cardLed") or {}).get("mode") == "steady")
        if not inserted_state:
            print("[ERROR] El Arduino no confirmó el indicador fijo con la tarjeta insertada.")
            return 1

        print("[OK] Indicador encendido: tarjeta presente.")
        print("[PRUEBA] Simulando corte de energía: el indicador debe parpadear sin retirar la tarjeta...")
        if not await bridge.set_grid(False, "prueba-corte"):
            print(f"[ERROR] El Arduino no confirmó el corte: {bridge.last_error or 'sin estado autoritativo'}")
            return 1
        outage_state = await wait_state(lambda event: event.get("gridAvailable") is False and (event.get("cardLed") or {}).get("mode") == "outage_blink")
        if not outage_state:
            print("[ERROR] El Arduino no informó el parpadeo del indicador durante el corte.")
            return 1
        print("[OK] Parpadeo por corte confirmado. Restableciendo la red...")
        if not await bridge.set_grid(True, "prueba-red-restaurada"):
            print("[ERROR] El Arduino no confirmó el restablecimiento de la red.")
            return 1
        if not await wait_state(lambda event: event.get("gridAvailable") is True and (event.get("cardLed") or {}).get("mode") == "steady"):
            print("[ERROR] El indicador no volvió a encendido fijo tras restablecer la red.")
            return 1
        print("[PRUEBA] Ejecutando un pulso breve en el indicador de tarjeta...")
        await bridge.test_card_led(250, "prueba-indicador-tarjeta")
        card_led_test = None
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(events.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if event.get("type") == "card_led_test" and event.get("commandId") == "prueba-indicador-tarjeta":
                card_led_test = event
                break
        if not card_led_test:
            print("[ERROR] El Arduino no confirmó la prueba del indicador de tarjeta.")
            return 1
        print("[OK] Pulso del indicador confirmado.")
        print("[PRUEBA] Comprobando los tres relés y sus LED del shield...")
        for slot in (2, 3, 1):
            if not await bridge.set_circuit(slot, False, f"preparar-led-{slot}"):
                print(f"[ERROR] El canal {slot} no confirmó el estado apagado.")
                return 1
        pin_map = bridge.status().get("circuitPinMap") or {"1": 12, "2": 11, "3": 10}
        relay_labels = tuple((slot, f"{name} / D{pin_map.get(str(slot), '?')}") for slot, name in ((1, "GENERAL"), (2, "1ER PISO"), (3, "2DO PISO")))
        for slot, label in relay_labels:
            if not await bridge.set_circuit(slot, True, f"probar-led-{slot}"):
                print(f"[ERROR] {label} no confirmó relé y LED encendidos.")
                return 1
            print(f"[OK] {label}: relé y LED encendidos. Observa el shield...")
            await asyncio.sleep(1)
            if slot > 1 and not await bridge.set_circuit(slot, False, f"apagar-led-{slot}"):
                print(f"[ERROR] {label} no confirmó el apagado.")
                return 1
        print("[OK] Los tres canales respondieron; General queda encendido y los pisos apagados.")
        print("[PRUEBA] Verificando EEPROM, mapa de pines y coherencia tarjeta/LED...")
        await bridge.self_test("prueba-guiada")
        self_test = None
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                event = await asyncio.wait_for(events.get(), timeout=0.5)
            except asyncio.TimeoutError:
                continue
            if event.get("type") == "self_test":
                self_test = event
                break
        if not self_test or not self_test.get("ok"):
            print(f"[ERROR] La prueba interna no fue satisfactoria: {self_test or 'sin respuesta'}")
            return 1
        print("[OK] EEPROM, tarjeta/LED y mapa de tres relés verificados.")
        print("[OK] General, 1er piso y 2do piso disponibles para el prototipo.")
        print("\nPRUEBA COMPLETADA: el UNO R3 esta listo para VoltKey ARDUINO TEST 1.2 (base 1.12.0).\n")
        return 0
    finally:
        await bridge.stop()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\nPrueba cancelada.")
        raise SystemExit(130)
