from __future__ import annotations

from pathlib import Path
import unittest


APP_SOURCE = (Path(__file__).resolve().parents[1] / "App.js").read_text(encoding="utf-8")


class AppContractTests(unittest.TestCase):
    def test_release_identity_is_alpha_arduino_2_1_0_with_hardware_1_2(self) -> None:
        self.assertIn('const RELEASE_VERSION = "2.1.0";', APP_SOURCE)
        self.assertIn('const ARDUINO_TEST_VERSION = "1.2";', APP_SOURCE)
        self.assertIn('const EDITION_ID = `arduino-test-${ARDUINO_TEST_VERSION}`;', APP_SOURCE)
        self.assertIn('VOLTKEY ALPHA ARDUINO ${RELEASE_VERSION}', APP_SOURCE)

    def test_circuit_controls_come_before_arduino_panel_and_view_selector_is_in_settings(self) -> None:
        circuit_start = APP_SOURCE.index('const CircuitsScreen = () => (')
        energy_start = APP_SOURCE.index('const EnergyScreen = () => {', circuit_start)
        circuit_source = APP_SOURCE[circuit_start:energy_start]
        self.assertLess(circuit_source.index('title={isChildProfile ? "MIS CONTROLES" : "DISTRIBUCIÓN"}'), circuit_source.index('<HardwarePrototypePanel />'))
        self.assertNotIn('CIRCUIT_VIEW_MODES.map', circuit_source)
        settings_start = APP_SOURCE.index('const SettingsScreen = () => (')
        screens_start = APP_SOURCE.index('const screens =', settings_start)
        settings_source = APP_SOURCE[settings_start:screens_start]
        self.assertIn('title="VISTA DE CIRCUITOS"', settings_source)
        self.assertIn('CIRCUIT_VIEW_MODES.map', settings_source)

    def test_voltkey_tec_contains_diagnostics_traceability_and_hardware_health(self) -> None:
        for title in ("CENTRO TÉCNICO", "SALUD FÍSICA Y TRAZABILIDAD", "ANOMALÍAS Y SEGUIMIENTO", "MANTENIMIENTO PREVENTIVO", "5 REGLAS DE ORO"):
            self.assertIn(title, APP_SOURCE)

    def test_voltkids_can_remain_in_settings_and_tutorial(self) -> None:
        self.assertIn('["inicio", "circuitos", "ajustes", ...(tutorialTabVisible ? ["tutorial"] : [])]', APP_SOURCE)
        self.assertNotIn('if (!["inicio", "circuitos"].includes(screen))', APP_SOURCE)

    def test_card_led_exposes_all_required_physical_states(self) -> None:
        for state in ("steady", "outage_blink", "countdown_blink", "off"):
            self.assertIn(state, APP_SOURCE)
        self.assertIn("CORTE: {Number(cardLedConfig.outageBlinkMs) / 1000} s", APP_SOURCE)

    def test_relay_and_card_led_pins_remain_configurable(self) -> None:
        self.assertIn("const changeRelayPin =", APP_SOURCE)
        self.assertIn("const changeCardLedPin =", APP_SOURCE)
        self.assertIn('type: "set_relay_config"', APP_SOURCE)
        self.assertIn('type: "set_card_led_config"', APP_SOURCE)

    def test_mission_onboarding_and_progressive_information_profiles_exist(self) -> None:
        for token in ("ADMIN_INTRO_MISSIONS", "CHILD_INTRO_MISSIONS", "TECH_INTRO_MISSIONS", "MissionIntroModal", "Perfil de información 2 desbloqueado", "Perfil de información 1 desbloqueado"):
            self.assertIn(token, APP_SOURCE)
        for preset in ('id: "1", label: "1 · COMPLETO"', 'id: "2", label: "2 · ESENCIAL"', 'id: "3", label: "3 · MÍNIMO"'):
            self.assertIn(preset, APP_SOURCE)
        self.assertIn('title="INFORMACIÓN VISIBLE"', APP_SOURCE)
        self.assertIn('SUBPESTAÑAS DE INFORMACIÓN', APP_SOURCE)

    def test_visible_ui_does_not_advertise_legacy_base_version(self) -> None:
        self.assertNotIn('BASE ALPHA ${APP_VERSION}', APP_SOURCE)
        self.assertNotIn('BASE ${APP_VERSION}', APP_SOURCE)
        self.assertNotIn('Firmware base 1.12.0', APP_SOURCE)
        self.assertNotIn('<Text style={styles.settingsLabel}>Base</Text>', APP_SOURCE)


if __name__ == "__main__":
    unittest.main()
