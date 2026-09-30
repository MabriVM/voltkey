from __future__ import annotations

import asyncio
import unittest

from servidor.arduino_bridge import ArduinoBridge


class FakeSerial:
    def __init__(self) -> None:
        self.is_open = True
        self.writes: list[bytes] = []

    def write(self, payload: bytes) -> int:
        self.writes.append(payload)
        return len(payload)

    def close(self) -> None:
        self.is_open = False


class ArduinoBridgeTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.bridge = ArduinoBridge()
        self.bridge.enabled = True
        self.bridge.connection = FakeSerial()
        self.events: list[dict] = []

        async def handler(event: dict) -> None:
            self.events.append(event)

        self.bridge._handler = handler

    async def test_serializes_server_commands_without_json(self) -> None:
        set_task = asyncio.create_task(self.bridge.set_circuit(1, True, "cmd-1"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|ACK|1|1|cmd-1")
        self.assertTrue(await set_task)
        card_task = asyncio.create_task(self.bridge.set_card(False, "card-1"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|CARDACK|0|card-1")
        self.assertTrue(await card_task)
        grid_task = asyncio.create_task(self.bridge.set_grid(True, "grid-1"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|GRIDACK|1|grid-1")
        self.assertTrue(await grid_task)
        await self.bridge.configure_policy([
            {"id": 1, "essential": True},
            {"id": 2, "essential": False},
            {"id": 3, "essential": False},
        ], 5)
        relay_config = asyncio.create_task(self.bridge.configure_relay(2, 9, True))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|CFGACK|1")
        self.assertTrue(await relay_config)
        card_led_config = asyncio.create_task(self.bridge.configure_card_led(8, False, 500))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|CARDLEDCFGACK|1")
        self.assertTrue(await card_led_config)
        await self.bridge.test_relay(2, 250, "test-2")
        await self.bridge.test_card_led(250, "test-card-led")
        await self.bridge.self_test("self-1")
        await self.bridge.emergency_stop("stop-1")
        await self.bridge.request_state()
        self.assertEqual(self.bridge.connection.writes[0], b"VK1|SET|1|1|cmd-1\n")
        self.assertEqual(self.bridge.connection.writes[1], b"VK1|CARDSET|0|card-1\n")
        self.assertEqual(self.bridge.connection.writes[2], b"VK1|GRIDSET|1|grid-1\n")
        self.assertEqual(self.bridge.connection.writes[3], b"VK1|POLICY|1|5\n")
        self.assertEqual(self.bridge.connection.writes[4], b"VK1|RELAYCFG|2|9|1\n")
        self.assertEqual(self.bridge.connection.writes[5], b"VK1|CARDLEDCFG|8|0|500\n")
        self.assertEqual(self.bridge.connection.writes[6], b"VK1|TESTRELAY|2|250|test-2\n")
        self.assertEqual(self.bridge.connection.writes[7], b"VK1|TESTCARDLED|250|test-card-led\n")
        self.assertEqual(self.bridge.connection.writes[8], b"VK1|SELFTEST|self-1\n")
        self.assertEqual(self.bridge.connection.writes[9], b"VK1|ESTOP|stop-1\n")
        self.assertEqual(self.bridge.connection.writes[10], b"VK1|STATE\n")

    async def test_parses_hello_state_ack_and_inputs(self) -> None:
        await self.bridge._handle_line("VK1|HELLO|1.12.0|3|UNO-SERVER-USB|1.2")
        await self.bridge._handle_line("VK1|STATE|1:1,2:0,3:1|CARD:0|GRID:1|ESS:1|DELAY:5|SEQ:7|MAP:12,9,10|ALOW:2|RLED:5|CLED:8,0,500,1,countdown_blink|CDOWN:3|LINK:1|CAUSE:physical_card")
        await self.bridge._handle_line("VK1|ACK|1|1|cmd-1")
        await self.bridge._handle_line("VK1|CARDACK|1|card-1")
        await self.bridge._handle_line("VK1|GRIDACK|1|grid-1")
        await self.bridge._handle_line("VK1|CARD|0")
        await self.bridge._handle_line("VK1|GRID|1")
        self.assertEqual(self.bridge.firmware, "1.12.0")
        self.assertEqual(self.bridge.server_role, "UNO-SERVER-USB")
        self.assertEqual(self.bridge.test_version, "1.2")
        self.assertEqual(self.events[1]["circuits"], {"1": True, "2": False, "3": True})
        self.assertFalse(self.events[1]["cardInserted"])
        self.assertTrue(self.events[1]["gridAvailable"])
        self.assertEqual(self.events[1]["essentialMask"], 1)
        self.assertEqual(self.events[1]["sequence"], 7)
        self.assertEqual(self.events[2]["commandId"], "cmd-1")
        self.assertEqual(self.events[3], {"type": "card_ack", "value": True, "commandId": "card-1"})
        self.assertEqual(self.events[4], {"type": "grid_ack", "value": True, "commandId": "grid-1"})
        self.assertFalse(self.events[5]["value"])
        self.assertTrue(self.events[6]["value"])
        status = self.bridge.status()
        self.assertEqual(status["authority"], "arduino-uno-r3")
        self.assertEqual(status["cardLedPin"], 8)
        self.assertEqual(status["cardLedMode"], "countdown_blink")
        self.assertEqual(status["cardLedOutageBlinkMs"], 500)
        self.assertEqual(status["cardCountdownSeconds"], 3)
        self.assertTrue(status["cardLedOutput"])
        self.assertEqual(status["circuitPinMap"]["1"], 12)
        self.assertEqual(status["circuitPinMap"]["2"], 9)
        self.assertEqual(status["relayIndicatorStates"], {"1": True, "2": False, "3": True})
        self.assertEqual(status["lastCause"], "physical_card")

    async def test_rejects_unmapped_circuit(self) -> None:
        result = await self.bridge.set_circuit(99, True, "invalid")
        self.assertFalse(result)
        self.assertEqual(self.bridge.connection.writes, [])

    async def test_rejects_a_physical_confirmation_that_differs(self) -> None:
        set_task = asyncio.create_task(self.bridge.set_circuit(2, True, "mismatch-2"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|ACK|2|0|mismatch-2")
        self.assertFalse(await set_task)
        self.assertIn("estado distinto", self.bridge.last_error)

    async def test_rejects_a_card_led_configuration_not_confirmed_by_the_uno(self) -> None:
        configure_task = asyncio.create_task(self.bridge.configure_card_led(8, False, 500))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|CARDLEDCFGACK|0")
        self.assertFalse(await configure_task)

    async def test_card_command_accepts_authoritative_state_if_direct_ack_is_lost(self) -> None:
        card_task = asyncio.create_task(self.bridge.set_card(False, "card-state-fallback"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|STATE|1:1,2:0,3:0|CARD:0|GRID:1|ESS:1|DELAY:5|SEQ:8|MAP:12,11,10|ALOW:0|RLED:1|CLED:13,0,1000,1,countdown_blink|CDOWN:5|LINK:1|CAUSE:app_card")
        self.assertTrue(await card_task)
        self.assertFalse(self.bridge.card_present)

    async def test_grid_command_accepts_authoritative_state_if_direct_ack_is_lost(self) -> None:
        grid_task = asyncio.create_task(self.bridge.set_grid(False, "grid-state-fallback"))
        await asyncio.sleep(0)
        await self.bridge._handle_line("VK1|STATE|1:1,2:0,3:0|CARD:1|GRID:0|ESS:1|DELAY:5|SEQ:9|MAP:12,11,10|ALOW:0|RLED:1|CLED:13,0,500,1,outage_blink|CDOWN:-1|LINK:1|CAUSE:grid_outage")
        self.assertTrue(await grid_task)
        self.assertFalse(self.bridge.grid_available)


if __name__ == "__main__":
    unittest.main()
