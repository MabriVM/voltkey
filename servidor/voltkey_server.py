"""Pasarela USB–Internet de VoltKey Arduino Test 1.2 (base Alpha 1.12.0).

El Arduino UNO R3 conserva el estado físico autoritativo de tarjeta, política y
salidas. FastAPI transporta ese estado hacia celular/PC y mantiene las funciones
que no caben en el microcontrolador: perfiles, historial, anomalías y tarifas.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import html
import io
import json
import math
import os
import random
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pypdf import PdfReader

from .arduino_bridge import ArduinoBridge


APP_VERSION = "1.12.0"
ARDUINO_TEST_VERSION = "1.2"
EDITION = f"arduino-test-{ARDUINO_TEST_VERSION}"
ARDUINO_BRIDGE = ArduinoBridge()


def env_setting(name: str, legacy_name: str, default: str) -> str:
    """Lee primero la variable VoltKey y conserva compatibilidad con Alpha."""
    return os.getenv(name, os.getenv(legacy_name, default))


ARDUINO_REQUIRED = env_setting("VOLTKEY_ARDUINO_REQUIRED", "ALPHA_ARDUINO_REQUIRED", "1").strip().lower() not in {"0", "false", "no"}
try:
    CARD_DELAY_SECONDS = max(0, min(60, int(env_setting("VOLTKEY_CARD_DELAY_SECONDS", "ALPHA_CARD_DELAY_SECONDS", "5"))))
except ValueError:
    CARD_DELAY_SECONDS = 5


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = Path(env_setting("VOLTKEY_DATA_DIR", "ALPHA_DATA_DIR", str(BASE_DIR / "data"))).expanduser().resolve()
STATE_PATH = DATA_DIR / "state.json"
LEGACY_DB_PATH = DATA_DIR / "alpha_history.sqlite3"
DB_PATH = DATA_DIR / "voltkey_history.sqlite3"
if LEGACY_DB_PATH.exists() and not DB_PATH.exists():
    DB_PATH = LEGACY_DB_PATH
TARIFF_CLP = float(env_setting("VOLTKEY_TARIFF_CLP", "ALPHA_TARIFF_CLP", "280"))
NOMINAL_VOLTAGE = float(env_setting("VOLTKEY_NOMINAL_VOLTAGE", "ALPHA_NOMINAL_VOLTAGE", "220"))
VOLTKEY_TOKEN = env_setting("VOLTKEY_TOKEN", "ALPHA_TOKEN", "").strip()
SIMULATION = env_setting("VOLTKEY_SIMULATION", "ALPHA_SIMULATION", "1").strip().lower() not in {"0", "false", "no"}
SEED_DEMO_HISTORY = env_setting("VOLTKEY_SEED_DEMO_HISTORY", "ALPHA_SEED_DEMO_HISTORY", "1").strip().lower() not in {"0", "false", "no"}
TIMEZONE_NAME = env_setting("VOLTKEY_TIMEZONE", "ALPHA_TIMEZONE", "America/Santiago")
try:
    LOCAL_TZ = ZoneInfo(TIMEZONE_NAME)
    TIMEZONE_STATUS = "iana"
except ZoneInfoNotFoundError:
    # Windows normalmente necesita el paquete tzdata. Este respaldo evita que
    # el servidor quede inutilizable mientras se corrige la instalación.
    LOCAL_TZ = None
    TIMEZONE_STATUS = "system-fallback"
HISTORY_DAYS = {"1m": 30, "3m": 90, "6m": 180, "1y": 365}
EDELAYSEN_TARIFF_PAGE = env_setting(
    "VOLTKEY_TARIFF_SOURCE_URL",
    "ALPHA_TARIFF_SOURCE_URL",
    "https://www.gruposaesa.cl/edelaysen/tarifas-vigentes",
)
TARIFF_AUTO_UPDATE = env_setting("VOLTKEY_TARIFF_AUTO_UPDATE", "ALPHA_TARIFF_AUTO_UPDATE", "1").strip().lower() not in {"0", "false", "no"}
TARIFF_RETRY_HOURS = max(1, int(env_setting("VOLTKEY_TARIFF_RETRY_HOURS", "ALPHA_TARIFF_RETRY_HOURS", "24")))
CURRENT_TARIFF_SNAPSHOT_DATE = "2026-08-01"
BATTERY_CAPACITY_KWH = 1.5
BATTERY_CHARGE_POWER_KW = 0.45
BATTERY_INVERTER_EFFICIENCY = 0.9
try:
    DEFAULT_ANOMALY_POWER_THRESHOLD = max(100.0, min(50000.0, float(env_setting(
        "VOLTKEY_ANOMALY_POWER_W", "ALPHA_ANOMALY_POWER_W", "3500",
    ))))
except ValueError:
    DEFAULT_ANOMALY_POWER_THRESHOLD = 3500.0


DEFAULT_CIRCUITS = [
    {"id": 1, "name": "GENERAL", "room": "Tablero prototipo", "icon": "flash-outline", "power": 0, "anomalyThreshold": 3500, "on": True, "essential": True, "adminLocked": False},
    {"id": 2, "name": "1ER PISO", "room": "Primer piso", "icon": "home-outline", "power": 500, "anomalyThreshold": 1000, "on": False, "essential": False, "adminLocked": False},
    {"id": 3, "name": "2DO PISO", "room": "Segundo piso", "icon": "business-outline", "power": 500, "anomalyThreshold": 1000, "on": False, "essential": False, "adminLocked": False},
]

DEFAULT_PROFILES = [
    {
        "id": "family-admin", "name": "Familia", "role": "normal", "icon": "people-outline",
        "pinHash": "", "allowedCircuitIds": [], "createdAt": "2026-08-22T00:00:00.000Z",
        "updatedAt": "2026-08-22T00:00:00.000Z",
    },
    {
        "id": "family-children", "name": "Niños", "role": "child", "icon": "happy-outline",
        "pinHash": "", "allowedCircuitIds": [2, 3], "createdAt": "2026-08-22T00:00:00.000Z",
        "updatedAt": "2026-08-22T00:00:00.000Z",
    },
]
PROFILE_ICONS = {
    "person-outline", "people-outline", "happy-outline", "home-outline",
    "school-outline", "game-controller-outline",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return datetime.now(LOCAL_TZ) if LOCAL_TZ is not None else datetime.now().astimezone()


def iso_now() -> str:
    return utc_now().isoformat()


def sanitize_profiles(raw_profiles: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_profiles, list):
        return [dict(profile, allowedCircuitIds=list(profile["allowedCircuitIds"])) for profile in DEFAULT_PROFILES]
    profiles: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_profiles[:12]:
        if not isinstance(raw, dict):
            continue
        profile_id = str(raw.get("id") or "").strip()[:80]
        name = str(raw.get("name") or "").strip()[:32]
        if not profile_id or not name or profile_id in seen:
            continue
        seen.add(profile_id)
        role = "child" if raw.get("role") == "child" else "normal"
        icon = str(raw.get("icon") or "")
        if icon not in PROFILE_ICONS:
            icon = "happy-outline" if role == "child" else "person-outline"
        allowed: list[Any] = []
        if role == "child" and isinstance(raw.get("allowedCircuitIds"), list):
            allowed_seen: set[str] = set()
            for circuit_id in raw["allowedCircuitIds"][:80]:
                key = str(circuit_id)
                if key in allowed_seen:
                    continue
                allowed_seen.add(key)
                allowed.append(circuit_id)
        profiles.append({
            "id": profile_id,
            "name": name,
            "role": role,
            "icon": icon,
            "pinHash": str(raw.get("pinHash") or "")[:80] if role == "normal" else "",
            "allowedCircuitIds": allowed,
            "createdAt": str(raw.get("createdAt") or iso_now()),
            "updatedAt": str(raw.get("updatedAt") or iso_now()),
        })
    if not any(profile["role"] == "normal" for profile in profiles):
        return [dict(profile, allowedCircuitIds=list(profile["allowedCircuitIds"])) for profile in DEFAULT_PROFILES]
    return profiles


def sanitize_circuit_catalog(raw_circuits: Any, fallback: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    if not isinstance(raw_circuits, list):
        source = fallback if fallback is not None else DEFAULT_CIRCUITS
        return [dict(circuit) for circuit in source]
    circuits: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_circuits[:100]:
        if not isinstance(raw, dict) or raw.get("id") is None:
            continue
        circuit_id = raw.get("id")
        key = str(circuit_id).strip()
        if not key or key in seen:
            continue
        seen.add(key)
        try:
            power = float(raw.get("power") or 0)
            if not math.isfinite(power):
                power = 0
        except (TypeError, ValueError):
            power = 0
        try:
            anomaly_threshold = float(raw.get("anomalyThreshold") or 0)
            if not math.isfinite(anomaly_threshold):
                anomaly_threshold = 0
        except (TypeError, ValueError):
            anomaly_threshold = 0
        normalized_power = max(0.0, min(100000.0, power))
        circuit = dict(raw)
        circuit.update({
            "id": circuit_id,
            "name": str(raw.get("name") or "Circuito").strip()[:80] or "Circuito",
            "icon": str(raw.get("icon") or "flash-outline").strip()[:80] or "flash-outline",
            "room": str(raw.get("room") or "Sin habitación").strip()[:40] or "Sin habitación",
            "power": normalized_power,
            "anomalyThreshold": max(100.0, min(100000.0, anomaly_threshold or max(100.0, round(normalized_power * 1.5)))),
            "on": bool(raw.get("on")),
            "essential": bool(raw.get("essential")),
            "custom": bool(raw.get("custom")),
            "adminLocked": bool(raw.get("adminLocked")),
            "adminDecisionAt": str(raw.get("adminDecisionAt")) if raw.get("adminDecisionAt") else None,
            "adminProfileId": str(raw.get("adminProfileId")) if raw.get("adminProfileId") else None,
            "controlUpdatedAt": str(raw.get("controlUpdatedAt")) if raw.get("controlUpdatedAt") else None,
            "lastControlCommandId": str(raw.get("lastControlCommandId"))[:120] if raw.get("lastControlCommandId") else None,
        })
        circuits.append(circuit)
    return circuits


def enforce_arduino_test_catalog(raw_circuits: Any) -> list[dict[str, Any]]:
    """Conserva tres slots editables y descarta circuitos sin salida física."""
    sanitized = sanitize_circuit_catalog(raw_circuits, [])
    by_id = {str(circuit.get("id")): circuit for circuit in sanitized}
    fixed: list[dict[str, Any]] = []
    for default in DEFAULT_CIRCUITS:
        existing = by_id.get(str(default["id"]))
        merged = {**default, **existing} if existing else dict(default)
        merged["id"] = default["id"]
        fixed.append(sanitize_circuit_catalog([merged], [default])[0])
    return fixed


def sanitize_anomaly_reviews(raw_reviews: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw_reviews, dict):
        return {}
    reviews: dict[str, dict[str, Any]] = {}
    for raw_key, raw in list(raw_reviews.items())[-500:]:
        if not isinstance(raw, dict):
            continue
        key = str(raw_key).strip()[:300]
        if not key:
            continue
        status = str(raw.get("status") or "open")
        if status not in {"open", "reviewed", "resolved"}:
            status = "open"
        reviews[key] = {
            "status": status,
            "note": str(raw.get("note") or "")[:500],
            "updatedAt": str(raw.get("updatedAt") or iso_now()),
            "reviewedBy": str(raw.get("reviewedBy") or "")[:80] or None,
        }
    return reviews


def sanitize_permission_requests(raw_requests: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_requests, list):
        return []
    requests: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_requests[-200:]:
        if not isinstance(raw, dict):
            continue
        request_id = str(raw.get("id") or "").strip()[:96]
        profile_id = str(raw.get("profileId") or "").strip()[:80]
        circuit_id = raw.get("circuitId")
        if not request_id or not profile_id or circuit_id is None or request_id in seen:
            continue
        seen.add(request_id)
        status = str(raw.get("status") or "pending")
        if status not in {"pending", "approved", "denied", "cancelled", "used", "expired"}:
            status = "pending"
        grant_scope = str(raw.get("grantScope") or "")
        if grant_scope not in {"once", "hour", "permanent"}:
            grant_scope = None
        try:
            remaining_uses = max(0, min(1, int(raw.get("remainingUses", 1)))) if grant_scope == "once" else None
        except (TypeError, ValueError):
            remaining_uses = 1 if grant_scope == "once" else None
        requests.append({
            "id": request_id,
            "profileId": profile_id,
            "profileName": str(raw.get("profileName") or "VoltKids").strip()[:32] or "VoltKids",
            "circuitId": circuit_id,
            "circuitName": str(raw.get("circuitName") or "Circuito").strip()[:80] or "Circuito",
            "status": status,
            "createdAt": str(raw.get("createdAt") or iso_now()),
            "resolvedAt": str(raw.get("resolvedAt")) if raw.get("resolvedAt") else None,
            "resolvedBy": str(raw.get("resolvedBy"))[:80] if raw.get("resolvedBy") else None,
            "grantScope": grant_scope,
            "expiresAt": str(raw.get("expiresAt")) if raw.get("expiresAt") else None,
            "remainingUses": remaining_uses,
        })
    return requests


def sanitize_activity_log(raw_log: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_log, list):
        return []
    result: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_log[-500:]:
        if not isinstance(raw, dict):
            continue
        entry_id = str(raw.get("id") or "").strip()[:120]
        if not entry_id or entry_id in seen:
            continue
        seen.add(entry_id)
        outcome = str(raw.get("outcome") or "applied")
        if outcome not in {"applied", "pending", "blocked", "failed"}:
            outcome = "applied"
        result.append({
            "id": entry_id,
            "timestamp": str(raw.get("timestamp") or iso_now()),
            "category": str(raw.get("category") or "system")[:32],
            "action": str(raw.get("action") or "Actividad")[:100],
            "detail": str(raw.get("detail") or "")[:300],
            "outcome": outcome,
            "circuitId": raw.get("circuitId"),
            "circuitName": str(raw.get("circuitName"))[:80] if raw.get("circuitName") else None,
            "profileId": str(raw.get("profileId"))[:80] if raw.get("profileId") else None,
            "profileName": str(raw.get("profileName") or "Sistema")[:32],
            "profileRole": "child" if raw.get("profileRole") == "child" else "normal",
            "device": str(raw.get("device") or "Dispositivo")[:40],
        })
    return sorted(result, key=lambda item: item.get("timestamp") or "", reverse=True)


def sanitize_archived_circuits(raw_circuits: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_circuits, list):
        return []
    archived: list[dict[str, Any]] = []
    seen: set[str] = set()
    for raw in raw_circuits[-100:]:
        sanitized = sanitize_circuit_catalog([raw], []) if isinstance(raw, dict) else []
        if not sanitized:
            continue
        circuit = sanitized[0]
        key = str(circuit.get("id"))
        if not key or key in seen:
            continue
        seen.add(key)
        circuit.update({
            "on": False,
            "adminLocked": False,
            "adminDecisionAt": None,
            "adminProfileId": None,
            "archivedAt": str(raw.get("archivedAt") or iso_now()),
        })
        archived.append(circuit)
    return archived


def sanitize_kids_missions(raw_missions: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(raw_missions, dict):
        return {}
    missions: dict[str, dict[str, Any]] = {}
    for raw_key, raw in list(raw_missions.items())[-100:]:
        if not isinstance(raw, dict):
            continue
        key = str(raw_key).strip()[:180]
        if not key:
            continue
        try:
            estimated_wh = max(0.0, min(5000.0, float(raw.get("estimatedWh") or 0)))
        except (TypeError, ValueError):
            estimated_wh = 0.0
        missions[key] = {
            "profileId": str(raw.get("profileId") or "")[:80],
            "tipId": str(raw.get("tipId") or "")[:80],
            "completedAt": str(raw.get("completedAt") or iso_now()),
            "estimatedWh": estimated_wh,
        }
    return missions


def initial_state() -> dict[str, Any]:
    return {
        "edition": EDITION,
        "arduinoTestEdition": ARDUINO_TEST_VERSION,
        "circuits": [dict(circuit) for circuit in DEFAULT_CIRCUITS],
        "circuitCatalogUpdatedAt": None,
        "controlPolicyVersion": "explicit-lock-v1",
        "schedules": [],
        "schedulePhases": {},
        "profiles": sanitize_profiles(DEFAULT_PROFILES),
        "profilesUpdatedAt": None,
        "anomalyReviews": {},
        "anomalyReviewsUpdatedAt": None,
        "anomalyPowerThreshold": DEFAULT_ANOMALY_POWER_THRESHOLD,
        "anomalySettingsUpdatedAt": None,
        "permissionRequests": [],
        "permissionRequestsUpdatedAt": None,
        "archivedCircuits": [],
        "archivedCircuitsUpdatedAt": None,
        "activityLog": [],
        "activityLogUpdatedAt": None,
        "kidsMissions": {},
        "kidsMissionsUpdatedAt": None,
        "hardwarePrototype": {
            "enabled": True,
            "labels": ["General", "1er piso", "2do piso"],
            "circuitIds": ["1", "2", "3"],
            "relayPins": [12, 11, 10],
            "activeLowMask": 0,
            "cardLed": {"pin": 13, "activeLow": False, "outageBlinkMs": 1000, "output": True, "mode": "steady"},
            "lastEvent": None,
            "lastSelfTest": None,
        },
        "cardInserted": True,
        "shutdownAt": None,
        "restoreCircuitIds": [],
        "gridAvailable": True,
        "battery": 87.0,
        "batteryHealth": 94.0,
        "batteryCycles": 126,
        "batteryTemperature": 27.0,
        "voltage": NOMINAL_VOLTAGE,
        "power": 0.0,
        "current": 0.0,
        "energy": 186.42,
        "cost": round(186.42 * TARIFF_CLP),
        "tariff": TARIFF_CLP,
        "tariffMeta": {
            "provider": "Edelaysen",
            "plan": "BT1 residencial",
            "status": "respaldo",
            "effectiveFrom": CURRENT_TARIFF_SNAPSHOT_DATE,
            "lastCheckedAt": None,
            "sourceUrl": EDELAYSEN_TARIFF_PAGE,
            "documentUrl": None,
            "exactVariableCharge": None,
            "fixedMonthlyCharge": None,
            "components": {},
            "lastError": None,
        },
        "tariffNotification": None,
        "simulation": SIMULATION,
        "lastUpdated": iso_now(),
    }


def load_state() -> dict[str, Any]:
    state = initial_state()
    migrate_arduino_test = False
    if STATE_PATH.exists():
        try:
            saved = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                if "controlPolicyVersion" not in saved:
                    saved["controlPolicyVersion"] = "legacy-auto-lock"
                saved_test_version = str(saved.get("arduinoTestEdition") or "")
                migrate_arduino_test = saved_test_version not in {"1.0", "1.1", ARDUINO_TEST_VERSION}
                state.update(saved)
        except (OSError, ValueError):
            pass
    if migrate_arduino_test:
        state["circuits"] = enforce_arduino_test_catalog(DEFAULT_CIRCUITS)
        state["schedules"] = []
        state["schedulePhases"] = {}
        state["archivedCircuits"] = []
        state["permissionRequests"] = []
        state["cardInserted"] = True
        state["shutdownAt"] = None
        state["restoreCircuitIds"] = []
        state["circuitCatalogUpdatedAt"] = iso_now()
    else:
        state["circuits"] = enforce_arduino_test_catalog(state.get("circuits"))
    state["edition"] = EDITION
    state["arduinoTestEdition"] = ARDUINO_TEST_VERSION
    prototype = state.get("hardwarePrototype") if isinstance(state.get("hardwarePrototype"), dict) else {}
    circuit_ids = ["1", "2", "3"]
    pins = prototype.get("relayPins", [12, 11, 10])
    try:
        pins = [int(value) for value in pins][:3]
    except (TypeError, ValueError):
        pins = [12, 11, 10]
    if len(pins) != 3 or len(set(pins)) != 3 or any(pin < 2 or pin > 12 for pin in pins):
        pins = [12, 11, 10]
    raw_card_led = prototype.get("cardLed") if isinstance(prototype.get("cardLed"), dict) else {}
    try:
        card_led_pin = int(raw_card_led.get("pin", 13))
        card_led_blink_ms = int(raw_card_led.get("outageBlinkMs", raw_card_led.get("blinkMs", 1000)))
    except (TypeError, ValueError):
        card_led_pin, card_led_blink_ms = 13, 1000
    if card_led_pin < 2 or card_led_pin > 13 or card_led_pin in pins:
        card_led_pin = 13 if 13 not in pins else next((pin for pin in range(2, 14) if pin not in pins), 13)
    card_led_blink_ms = min((250, 500, 1000, 2000), key=lambda value: abs(value - max(200, min(2000, card_led_blink_ms))))
    card_led = {
        "pin": card_led_pin,
        "activeLow": bool(raw_card_led.get("activeLow")),
        "outageBlinkMs": card_led_blink_ms,
        "output": bool(raw_card_led.get("output", state.get("cardInserted", True))),
        "mode": str(raw_card_led.get("mode")) if str(raw_card_led.get("mode")) in {"steady", "outage_blink", "countdown_blink", "off"} else ("steady" if state.get("cardInserted", True) and state.get("gridAvailable", True) else "off"),
    }
    state["hardwarePrototype"] = {
        "enabled": bool(prototype.get("enabled", True)),
        "labels": ["General", "1er piso", "2do piso"],
        "circuitIds": circuit_ids,
        "relayPins": pins,
        "activeLowMask": int(prototype.get("activeLowMask") or 0) & 7,
        "cardLed": card_led,
        "lastEvent": prototype.get("lastEvent") if isinstance(prototype.get("lastEvent"), dict) else None,
        "lastSelfTest": prototype.get("lastSelfTest") if isinstance(prototype.get("lastSelfTest"), dict) else None,
    }
    if state.get("circuitCatalogUpdatedAt") is not None:
        state["circuitCatalogUpdatedAt"] = str(state["circuitCatalogUpdatedAt"])
    migrate_automatic_locks = state.get("controlPolicyVersion") != "explicit-lock-v1"
    migration_time = iso_now()
    for circuit in state["circuits"]:
        if not isinstance(circuit, dict):
            continue
        circuit["adminLocked"] = bool(circuit.get("adminLocked"))
        circuit["adminDecisionAt"] = str(circuit.get("adminDecisionAt")) if circuit.get("adminDecisionAt") else None
        circuit["adminProfileId"] = str(circuit.get("adminProfileId")) if circuit.get("adminProfileId") else None
        circuit["controlUpdatedAt"] = str(circuit.get("controlUpdatedAt")) if circuit.get("controlUpdatedAt") else None
        circuit["lastControlCommandId"] = str(circuit.get("lastControlCommandId")) if circuit.get("lastControlCommandId") else None
        if migrate_automatic_locks:
            circuit["adminLocked"] = False
            circuit["adminDecisionAt"] = None
            circuit["adminProfileId"] = None
            circuit["controlUpdatedAt"] = migration_time
    state["controlPolicyVersion"] = "explicit-lock-v1"
    if not isinstance(state.get("schedules"), list):
        state["schedules"] = []
    if not isinstance(state.get("schedulePhases"), dict):
        state["schedulePhases"] = {}
    else:
        state["schedulePhases"] = {str(key): bool(value) for key, value in state["schedulePhases"].items()}
    state["profiles"] = sanitize_profiles(state.get("profiles"))
    if migrate_arduino_test:
        for profile in state["profiles"]:
            if profile.get("role") == "child":
                profile["allowedCircuitIds"] = [2, 3]
                profile["updatedAt"] = iso_now()
    if state.get("profilesUpdatedAt") is not None:
        state["profilesUpdatedAt"] = str(state["profilesUpdatedAt"])
    state["anomalyReviews"] = sanitize_anomaly_reviews(state.get("anomalyReviews"))
    if state.get("anomalyReviewsUpdatedAt") is not None:
        state["anomalyReviewsUpdatedAt"] = str(state["anomalyReviewsUpdatedAt"])
    try:
        state["anomalyPowerThreshold"] = max(100.0, min(50000.0, float(
            state.get("anomalyPowerThreshold") or DEFAULT_ANOMALY_POWER_THRESHOLD
        )))
    except (TypeError, ValueError):
        state["anomalyPowerThreshold"] = DEFAULT_ANOMALY_POWER_THRESHOLD
    if state.get("anomalySettingsUpdatedAt") is not None:
        state["anomalySettingsUpdatedAt"] = str(state["anomalySettingsUpdatedAt"])
    state["permissionRequests"] = sanitize_permission_requests(state.get("permissionRequests"))
    if state.get("permissionRequestsUpdatedAt") is not None:
        state["permissionRequestsUpdatedAt"] = str(state["permissionRequestsUpdatedAt"])
    state["archivedCircuits"] = sanitize_archived_circuits(state.get("archivedCircuits"))
    if state.get("archivedCircuitsUpdatedAt") is not None:
        state["archivedCircuitsUpdatedAt"] = str(state["archivedCircuitsUpdatedAt"])
    state["activityLog"] = sanitize_activity_log(state.get("activityLog"))
    if state.get("activityLogUpdatedAt") is not None:
        state["activityLogUpdatedAt"] = str(state["activityLogUpdatedAt"])
    state["kidsMissions"] = sanitize_kids_missions(state.get("kidsMissions"))
    if state.get("kidsMissionsUpdatedAt") is not None:
        state["kidsMissionsUpdatedAt"] = str(state["kidsMissionsUpdatedAt"])
    try:
        state["batteryHealth"] = max(0.0, min(100.0, float(state.get("batteryHealth") or 94.0)))
        state["batteryCycles"] = max(0, int(state.get("batteryCycles") or 126))
        state["batteryTemperature"] = max(-20.0, min(90.0, float(state.get("batteryTemperature") or 27.0)))
    except (TypeError, ValueError):
        state["batteryHealth"], state["batteryCycles"], state["batteryTemperature"] = 94.0, 126, 27.0
    default_meta = initial_state()["tariffMeta"]
    saved_meta = state.get("tariffMeta") if isinstance(state.get("tariffMeta"), dict) else {}
    state["tariffMeta"] = {**default_meta, **saved_meta, "sourceUrl": EDELAYSEN_TARIFF_PAGE}
    # Migra automáticamente proyectos anteriores que usaban $180/kWh.
    if float(state.get("tariff") or 0) <= 180:
        state["tariff"] = TARIFF_CLP
        state["cost"] = round(float(state.get("energy") or 0) * TARIFF_CLP, 2)
        state["tariffMeta"] = default_meta
    return state


def save_state() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = STATE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps(STATE, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(STATE_PATH)


def _http_bytes(url: str, accept: str, timeout: int = 25) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36",
            "Accept": accept,
            "Accept-Language": "es-CL,es;q=0.9",
            "Referer": EDELAYSEN_TARIFF_PAGE,
            "Cache-Control": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(), response.geturl()


def _plain_html(fragment: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def _find_latest_tariff_document(page_html: str) -> tuple[str, str | None]:
    blocks = re.findall(r"<tr\b[^>]*>.*?</tr>", page_html, flags=re.IGNORECASE | re.DOTALL)
    if not blocks:
        for match in re.finditer(r"Tarifas\s+de\s+Suministro\s+Regulado", page_html, flags=re.IGNORECASE):
            blocks.append(page_html[max(0, match.start() - 1200):match.end() + 1800])
    for block in blocks:
        label = _plain_html(block)
        if "tarifas de suministro regulado" not in label.lower() or "pdf" not in label.lower():
            continue
        hrefs = re.findall(r"href=[\"']([^\"']+)[\"']", block, flags=re.IGNORECASE)
        href = next((value for value in hrefs if "descargar-archivos" in value), None)
        if not href:
            continue
        date_match = re.search(r"desde el\s+(\d{2})/(\d{2})/(\d{4})", label, flags=re.IGNORECASE)
        effective_from = None
        if date_match:
            day, month, year = date_match.groups()
            effective_from = f"{year}-{month}-{day}"
        return urllib.parse.urljoin(EDELAYSEN_TARIFF_PAGE, href), effective_from
    raise ValueError("La página oficial no publicó un pliego PDF reconocible.")


def _clp_number(value: str) -> float:
    return float(value.replace(".", "").replace(",", "."))


def _iva_value(section: str, label_pattern: str, required: bool = True) -> float:
    match = re.search(
        rf"{label_pattern}.{{0,150}}?\$/kWh\s+([0-9.]+,[0-9]+)\s+([0-9.]+,[0-9]+)",
        section,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        if required:
            raise ValueError(f"No se encontró el componente BT1: {label_pattern}")
        return 0.0
    return _clp_number(match.group(2))


def _parse_bt1_pdf_text(text: str) -> dict[str, Any]:
    normalized = re.sub(r"[\t\r ]+", " ", text.replace("\u00a0", " "))
    start = re.search(r"Tarifa\s+BT1\b", normalized, flags=re.IGNORECASE)
    if not start:
        raise ValueError("El pliego no contiene la sección Tarifa BT1.")
    remainder = normalized[start.end():]
    end = re.search(r"\n\s*Tarifa\s+(?!BT1\b)", remainder, flags=re.IGNORECASE)
    section = remainder[:end.start()] if end else remainder[:12000]

    components = {
        "transporte": _iva_value(section, r"Transporte\s+de\s+Electricidad", required=False),
        "servicioPublico": _iva_value(section, r"Cargo\s+por\s+servicio\s+p[uú]blico"),
        "energia": _iva_value(section, r"Cargo\s+por\s+energ[ií]a"),
        "comprasPotencia": _iva_value(section, r"Cargo\s+por\s+compras\s+de\s+potencia"),
        "distribucionEtr1": _iva_value(
            section,
            r"Cargo\s+por\s+potencia\s+en\s+su\s+componente\s+de\s+distribuci[oó]n\s+tramo\s+factor\s+ETR\s*1",
        ),
    }
    exact_charge = round(sum(components.values()), 3)
    if not 150 <= exact_charge <= 800:
        raise ValueError(f"El valor BT1 calculado quedó fuera de rango: {exact_charge}")

    fixed_match = re.search(
        r"Administraci[oó]n\s+del\s+servicio.*?\$/mes\s+([0-9.]+,[0-9]+)\s+([0-9.]+,[0-9]+)",
        section,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return {
        "tariff": float(round(exact_charge)),
        "exactVariableCharge": exact_charge,
        "fixedMonthlyCharge": _clp_number(fixed_match.group(2)) if fixed_match else None,
        "components": {key: round(value, 3) for key, value in components.items()},
    }


def fetch_edelaysen_tariff() -> dict[str, Any]:
    page_bytes, _ = _http_bytes(EDELAYSEN_TARIFF_PAGE, "text/html,application/xhtml+xml")
    page_html = page_bytes.decode("utf-8", errors="replace")
    document_url, effective_from = _find_latest_tariff_document(page_html)
    pdf_bytes, resolved_url = _http_bytes(document_url, "application/pdf,*/*;q=0.8")
    if not pdf_bytes.startswith(b"%PDF"):
        raise ValueError("La descarga oficial no devolvió un archivo PDF.")
    reader = PdfReader(io.BytesIO(pdf_bytes))
    if not reader.pages:
        raise ValueError("El pliego tarifario oficial está vacío.")
    parsed = _parse_bt1_pdf_text(reader.pages[0].extract_text() or "")
    parsed.update({
        "effectiveFrom": effective_from,
        "documentUrl": resolved_url,
        "sourceUrl": EDELAYSEN_TARIFF_PAGE,
    })
    return parsed


def db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with db_connection() as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                voltage REAL NOT NULL,
                current REAL NOT NULL,
                power REAL NOT NULL,
                consumption REAL NOT NULL,
                cost REAL NOT NULL,
                source TEXT NOT NULL DEFAULT 'live'
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS anomalies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                metric TEXT NOT NULL,
                anomaly_type TEXT NOT NULL,
                value REAL NOT NULL,
                unit TEXT NOT NULL,
                severity TEXT NOT NULL,
                details TEXT NOT NULL,
                UNIQUE(timestamp, metric, anomaly_type)
            )
            """
        )
        count = connection.execute("SELECT COUNT(*) FROM telemetry").fetchone()[0]
        if count == 0 and SEED_DEMO_HISTORY:
            seed_demo_history(connection)


def seed_demo_history(connection: sqlite3.Connection) -> None:
    now = local_now().replace(hour=12, minute=0, second=0, microsecond=0)
    rows: list[tuple[Any, ...]] = []
    anomaly_rows: list[tuple[Any, ...]] = []
    anomaly_offsets = {19: 194.0, 96: 191.0, 203: 245.0}
    for days_ago in range(364, -1, -1):
        date = now - timedelta(days=days_ago)
        seasonal = math.sin((365 - days_ago) / 24) * 1.15
        weekend = 0.85 if date.weekday() >= 5 else 0.0
        consumption = max(2.1, 5.4 + seasonal + weekend + math.sin(days_ago * 1.73) * 0.38)
        voltage = anomaly_offsets.get(days_ago, NOMINAL_VOLTAGE + math.sin(days_ago * 0.71) * 4.2)
        power = consumption / 8 * 1000
        current = power / max(voltage, 1)
        timestamp = date.astimezone(timezone.utc).isoformat()
        rows.append((timestamp, voltage, current, power, consumption, consumption * TARIFF_CLP, "simulation"))
        if voltage < NOMINAL_VOLTAGE * 0.9:
            anomaly_rows.append((timestamp, "voltage", "Caída de voltaje", voltage, "V", "warning", "Valor bajo respecto del rango configurado."))
        elif voltage > NOMINAL_VOLTAGE * 1.1:
            anomaly_rows.append((timestamp, "voltage", "Sobretensión", voltage, "V", "warning", "Valor alto respecto del rango configurado."))
    connection.executemany(
        "INSERT INTO telemetry(timestamp, voltage, current, power, consumption, cost, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
        rows,
    )
    if anomaly_rows:
        connection.executemany(
            "INSERT OR IGNORE INTO anomalies(timestamp, metric, anomaly_type, value, unit, severity, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            anomaly_rows,
        )


def token_is_valid(candidate: str) -> bool:
    if not VOLTKEY_TOKEN:
        return True
    return hmac.compare_digest(candidate or "", VOLTKEY_TOKEN)


def state_for_client(message_type: str = "state_update", reason: str = "state", source: str = "server") -> dict[str, Any]:
    return {
        "type": message_type,
        **STATE,
        "hardwareBridge": ARDUINO_BRIDGE.status(),
        "reason": reason,
        "source": source,
        "serverTime": iso_now(),
    }


def circuit_by_id(circuit_id: Any) -> dict[str, Any] | None:
    return next((circuit for circuit in STATE["circuits"] if str(circuit.get("id")) == str(circuit_id)), None)


def physical_circuit_slots() -> list[dict[str, Any]]:
    """Convierte el catálogo editable en los slots físicos 1 General, 2 y 3."""
    ids = STATE.get("hardwarePrototype", {}).get("circuitIds", ["1", "2", "3"])
    slots: list[dict[str, Any]] = []
    for index, circuit_id in enumerate(ids[:3]):
        circuit = circuit_by_id(circuit_id)
        if circuit:
            slots.append({**circuit, "id": index + 1})
    return slots


def profile_by_id(profile_id: Any) -> dict[str, Any] | None:
    return next((profile for profile in STATE.get("profiles") or [] if str(profile.get("id")) == str(profile_id)), None)


def permission_grant_is_active(request: dict[str, Any], profile_id: Any, circuit_id: Any) -> bool:
    if (request.get("status") != "approved"
            or str(request.get("profileId")) != str(profile_id)
            or str(request.get("circuitId")) != str(circuit_id)):
        return False
    scope = request.get("grantScope")
    if scope == "once":
        return int(request.get("remainingUses") or 0) > 0
    if scope == "hour":
        try:
            expires_at = datetime.fromisoformat(str(request.get("expiresAt") or "").replace("Z", "+00:00"))
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            return expires_at > utc_now()
        except ValueError:
            return False
    return scope == "permanent"


def child_allows_circuit(profile: dict[str, Any], circuit_id: Any) -> bool:
    allowed = {str(value) for value in profile.get("allowedCircuitIds") or []}
    if str(circuit_id) in allowed:
        return True
    return any(permission_grant_is_active(request, profile.get("id"), circuit_id)
               for request in STATE.get("permissionRequests") or [])


def expire_permission_grants() -> bool:
    changed = False
    updated_at = iso_now()
    for request in STATE.get("permissionRequests") or []:
        if request.get("status") != "approved" or request.get("grantScope") != "hour":
            continue
        if not permission_grant_is_active(request, request.get("profileId"), request.get("circuitId")):
            request.update({"status": "expired", "remainingUses": None})
            changed = True
    if changed:
        STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
        STATE["permissionRequestsUpdatedAt"] = updated_at
    return changed


def timestamp_is_newer(candidate: Any, current: Any) -> bool:
    if not candidate:
        return False
    if not current:
        return True
    try:
        candidate_date = datetime.fromisoformat(str(candidate).replace("Z", "+00:00"))
        current_date = datetime.fromisoformat(str(current).replace("Z", "+00:00"))
        return candidate_date > current_date
    except ValueError:
        return str(candidate) > str(current)


def clean_circuit_references() -> None:
    valid_ids = {str(circuit.get("id")) for circuit in STATE.get("circuits") or []}
    STATE["schedules"] = [
        schedule for schedule in STATE.get("schedules") or []
        if str(schedule.get("circuitId")) in valid_ids
    ]
    STATE["schedulePhases"] = {
        str(key): bool(value) for key, value in (STATE.get("schedulePhases") or {}).items()
        if str(key) in valid_ids
    }
    for profile in STATE.get("profiles") or []:
        if profile.get("role") == "child":
            profile["allowedCircuitIds"] = [
                value for value in profile.get("allowedCircuitIds") or []
                if str(value) in valid_ids
            ]
    resolved_at = iso_now()
    requests_changed = False
    for request in STATE.get("permissionRequests") or []:
        if request.get("status") in {"pending", "approved"} and str(request.get("circuitId")) not in valid_ids:
            request.update({"status": "cancelled", "resolvedAt": resolved_at, "resolvedBy": None})
            requests_changed = True
    if requests_changed:
        STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
        STATE["permissionRequestsUpdatedAt"] = resolved_at


def schedule_minutes(value: str) -> int | None:
    try:
        hours, minutes = [int(part) for part in value.split(":", 1)]
    except (AttributeError, ValueError):
        return None
    if not 0 <= hours <= 23 or not 0 <= minutes <= 59:
        return None
    return hours * 60 + minutes


def schedule_active(schedule: dict[str, Any], moment: datetime) -> bool:
    if not schedule.get("enabled") or not schedule.get("days"):
        return False
    start = schedule_minutes(schedule.get("start", ""))
    end = schedule_minutes(schedule.get("end", ""))
    if start is None or end is None or start == end:
        return False
    current = moment.hour * 60 + moment.minute
    day = (moment.weekday() + 1) % 7
    days = {int(value) for value in schedule.get("days", [])}
    if start < end:
        return day in days and start <= current < end
    previous_day = (day + 6) % 7
    return (day in days and current >= start) or (previous_day in days and current < end)


def card_blocks_nonessential() -> bool:
    if STATE.get("cardInserted"):
        return False
    shutdown_at = STATE.get("shutdownAt")
    if not shutdown_at:
        return True
    try:
        return utc_now() >= datetime.fromisoformat(str(shutdown_at))
    except ValueError:
        return True


def evaluate_schedules(moment: datetime | None = None) -> list[dict[str, Any]]:
    moment = moment or local_now()
    changed: list[dict[str, Any]] = []
    phases = STATE.setdefault("schedulePhases", {})
    active_keys: set[str] = set()
    for circuit in STATE["circuits"]:
        circuit_key = str(circuit.get("id"))
        schedules = [item for item in STATE["schedules"] if str(item.get("circuitId")) == str(circuit.get("id")) and item.get("enabled")]
        if not schedules:
            phases.pop(circuit_key, None)
            continue
        active_keys.add(circuit_key)
        desired = any(schedule_active(schedule, moment) for schedule in schedules)
        if (card_blocks_nonessential() or not STATE["gridAvailable"]) and not circuit.get("essential"):
            desired = False
        previous_phase = phases.get(circuit_key)
        phases[circuit_key] = desired
        if previous_phase is None or bool(previous_phase) != desired:
            if bool(circuit.get("on")) == desired:
                continue
            circuit["on"] = desired
            circuit["controlUpdatedAt"] = iso_now()
            circuit["lastControlCommandId"] = None
            changed.append(circuit)
    for key in list(phases):
        if key not in active_keys:
            phases.pop(key, None)
    return changed


def sanitize_schedule(raw: dict[str, Any]) -> dict[str, Any]:
    start = str(raw.get("start", ""))
    end = str(raw.get("end", ""))
    if schedule_minutes(start) is None or schedule_minutes(end) is None or start == end:
        raise ValueError("Horario no válido")
    if circuit_by_id(raw.get("circuitId")) is None:
        raise ValueError("Circuito no encontrado")
    days = sorted({int(day) for day in raw.get("days", []) if str(day).isdigit() and 0 <= int(day) <= 6})
    if not days:
        raise ValueError("Selecciona al menos un día")
    return {
        "id": raw.get("id") or f"schedule-{uuid.uuid4().hex[:12]}",
        "circuitId": raw.get("circuitId"),
        "start": start,
        "end": end,
        "days": days,
        "enabled": bool(raw.get("enabled", True)),
        "updatedAt": iso_now(),
    }


def record_anomaly(metric: str, anomaly_type: str, value: float, unit: str, severity: str, details: str) -> None:
    timestamp = iso_now()
    with db_connection() as connection:
        recent = connection.execute(
            "SELECT timestamp FROM anomalies WHERE metric=? AND anomaly_type=? ORDER BY timestamp DESC LIMIT 1",
            (metric, anomaly_type),
        ).fetchone()
        if recent:
            last = datetime.fromisoformat(recent["timestamp"])
            if utc_now() - last < timedelta(minutes=10):
                return
        connection.execute(
            "INSERT OR IGNORE INTO anomalies(timestamp, metric, anomaly_type, value, unit, severity, details) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (timestamp, metric, anomaly_type, value, unit, severity, details),
        )


def query_history(period: str) -> dict[str, Any]:
    days = HISTORY_DAYS.get(period, 30)
    since = (utc_now() - timedelta(days=days)).isoformat()
    bucket = "%Y-%m-%d %H:00:00" if period == "1m" else "%Y-%m-%d 00:00:00"
    with db_connection() as connection:
        rows = connection.execute(
            f"""
            SELECT strftime('{bucket}', timestamp) AS bucket,
                   AVG(voltage) AS voltage,
                   MIN(voltage) AS voltage_min,
                   MAX(voltage) AS voltage_max,
                   AVG(current) AS current,
                   AVG(power) AS power,
                   SUM(consumption) AS consumption,
                   SUM(cost) AS cost,
                   CASE WHEN COUNT(DISTINCT source) > 1 THEN 'mixed' ELSE MIN(source) END AS source
            FROM telemetry
            WHERE timestamp >= ?
            GROUP BY bucket
            ORDER BY bucket ASC
            """,
            (since,),
        ).fetchall()
        anomaly_rows = connection.execute(
            "SELECT timestamp, metric, anomaly_type, value, unit, severity, details FROM anomalies WHERE timestamp >= ? ORDER BY timestamp DESC LIMIT 200",
            (since,),
        ).fetchall()
    records = [
        {
            "timestamp": f"{row['bucket'].replace(' ', 'T')}Z",
            "voltage": round(row["voltage"] or 0, 2),
            "voltageMin": round(row["voltage_min"] or 0, 2),
            "voltageMax": round(row["voltage_max"] or 0, 2),
            "current": round(row["current"] or 0, 3),
            "power": round(row["power"] or 0, 1),
            "consumption": round(row["consumption"] or 0, 5),
            "cost": round(row["cost"] or 0, 2),
            "source": row["source"],
        }
        for row in rows
    ]
    anomalies = [
        {
            "timestamp": row["timestamp"],
            "metric": row["metric"],
            "type": row["anomaly_type"],
            "value": row["value"],
            "unit": row["unit"],
            "severity": row["severity"],
            "details": row["details"],
        }
        for row in anomaly_rows
    ]
    sources = {record["source"] for record in records}
    source = "mixed" if len(sources) > 1 else next(iter(sources), "live")
    return {"type": "history", "period": period, "records": records, "anomalies": anomalies, "source": source, "serverTime": iso_now()}


STATE = load_state()
clean_circuit_references()
STATE_LOCK = asyncio.Lock()
TARIFF_REFRESH_LOCK = asyncio.Lock()
CARD_SHUTDOWN_TASK: asyncio.Task[Any] | None = None


class ConnectionManager:
    def __init__(self) -> None:
        self.clients: dict[WebSocket, dict[str, Any]] = {}

    async def connect(self, websocket: WebSocket, client_id: str, platform: str, name: str) -> None:
        await websocket.accept()
        self.clients[websocket] = {
            "id": client_id or uuid.uuid4().hex,
            "platform": platform or "unknown",
            "name": name or ("Computador" if platform == "web" else "Celular"),
            "connectedAt": iso_now(),
        }

    def disconnect(self, websocket: WebSocket) -> None:
        self.clients.pop(websocket, None)

    async def send(self, websocket: WebSocket, message: dict[str, Any]) -> None:
        await websocket.send_json(message)

    async def broadcast(self, message: dict[str, Any]) -> None:
        disconnected: list[WebSocket] = []
        for websocket in list(self.clients):
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)

    async def broadcast_presence(self) -> None:
        clients = list(self.clients.values())
        await self.broadcast({"type": "presence", "clientCount": len(clients), "clients": clients, "serverTime": iso_now()})


MANAGER = ConnectionManager()


async def persist_and_broadcast(reason: str, source: str) -> None:
    STATE["lastUpdated"] = iso_now()
    save_state()
    await MANAGER.broadcast(state_for_client(reason=reason, source=source))


async def handle_arduino_event(event: dict[str, Any]) -> None:
    """Replica hacia Internet el estado cuyo origen de verdad es el UNO R3."""
    event_type = event.get("type")
    if event_type == "hello":
        await ARDUINO_BRIDGE.request_state()
        await MANAGER.broadcast(state_for_client(reason="arduino_connected", source="arduino-uno-r3"))
        return
    if event_type == "pong":
        return

    async with STATE_LOCK:
        if event_type == "toggle":
            await ARDUINO_BRIDGE.request_state()
            return

        if event_type in {"relay_config", "relay_test", "card_led_config", "card_led_test", "self_test", "emergency_stop"}:
            prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
            now = iso_now()
            prototype["lastEvent"] = {
                "type": event_type,
                "at": now,
                "origin": "arduino-uno-r3",
                "detail": event.get("cause") or event.get("slot") or event.get("commandId"),
            }
            if event_type == "self_test":
                prototype["lastSelfTest"] = {"ok": bool(event.get("ok")), "checks": event.get("checks") or {}, "at": now}
            await persist_and_broadcast(f"arduino_{event_type}", "arduino-uno-r3")
            return

        if event_type in {"card", "card_ack"}:
            inserted = bool(event.get("value"))
            STATE["cardInserted"] = inserted
            STATE["shutdownAt"] = None if inserted else (utc_now() + timedelta(seconds=CARD_DELAY_SECONDS)).isoformat()
            await persist_and_broadcast(
                "arduino_card_inserted" if inserted else "arduino_card_removed",
                "arduino-uno-r3",
            )
            return

        if event_type == "grid":
            available = bool(event.get("value"))
            STATE["gridAvailable"] = available
            if not available:
                for circuit in STATE.get("circuits") or []:
                    if not circuit.get("essential"):
                        circuit["on"] = False
                        circuit["controlUpdatedAt"] = iso_now()
            await persist_and_broadcast("arduino_grid_available" if available else "arduino_grid_lost", "arduino-uno-r3")
            return

        if event_type == "ack":
            prototype_ids = STATE.get("hardwarePrototype", {}).get("circuitIds", ["1", "2", "3"])
            try:
                slot = int(event.get("circuitId")) - 1
                mapped_id = prototype_ids[slot]
            except (TypeError, ValueError, IndexError):
                return
            circuit = circuit_by_id(mapped_id)
            if not circuit:
                return
            actual = bool(event.get("on"))
            circuit["on"] = actual
            circuit["hardwareState"] = actual
            circuit["hardwareConfirmedAt"] = iso_now()
            if event.get("commandId") and event.get("commandId") != "-":
                circuit["hardwareCommandId"] = str(event.get("commandId"))[:120]
            await persist_and_broadcast("arduino_output_confirmed", "arduino-uno-r3")
            return

        if event_type == "state":
            hardware_states = event.get("circuits") if isinstance(event.get("circuits"), dict) else {}
            STATE["hardwareOutputStates"] = {str(key): bool(value) for key, value in hardware_states.items()}
            STATE["hardwareOutputUpdatedAt"] = iso_now()
            changed_at = iso_now()
            prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
            if isinstance(event.get("relayPins"), list) and len(event["relayPins"]) == 3:
                prototype["relayPins"] = event["relayPins"]
            prototype["activeLowMask"] = int(event.get("activeLowMask") or 0) & 7
            if isinstance(event.get("cardLed"), dict):
                raw_card_led = event["cardLed"]
                led_mode = str(raw_card_led.get("mode") or "off")
                if led_mode not in {"steady", "outage_blink", "countdown_blink", "off"}: led_mode = "off"
                prototype["cardLed"] = {
                    "pin": int(raw_card_led.get("pin") or 13),
                    "activeLow": bool(raw_card_led.get("activeLow")),
                    "outageBlinkMs": max(200, min(2000, int(raw_card_led.get("outageBlinkMs", raw_card_led.get("blinkMs", 1000)) or 1000))),
                    "output": bool(raw_card_led.get("output")),
                    "mode": led_mode,
                }
            prototype["lastEvent"] = {
                "type": "physical_state",
                "at": changed_at,
                "origin": str(event.get("cause") or "arduino"),
                "linkOnline": event.get("linkOnline"),
            }
            prototype_ids = [str(value) for value in prototype.get("circuitIds", ["1", "2", "3"])]
            for circuit in STATE.get("circuits") or []:
                circuit_id = str(circuit.get("id"))
                try:
                    hardware_id = str(prototype_ids.index(circuit_id) + 1)
                except ValueError:
                    continue
                if hardware_id not in hardware_states:
                    continue
                actual = bool(hardware_states[hardware_id])
                if bool(circuit.get("on")) != actual:
                    circuit["on"] = actual
                    circuit["controlUpdatedAt"] = changed_at
                circuit["hardwareState"] = actual
                circuit["hardwareConfirmedAt"] = changed_at

            if isinstance(event.get("cardInserted"), bool):
                STATE["cardInserted"] = event["cardInserted"]
            if isinstance(event.get("gridAvailable"), bool):
                STATE["gridAvailable"] = event["gridAvailable"]

            try:
                essential_mask = int(event.get("essentialMask"))
            except (TypeError, ValueError):
                essential_mask = None
            if essential_mask is not None:
                for circuit in STATE.get("circuits") or []:
                    try:
                        slot = prototype_ids.index(str(circuit.get("id")))
                    except ValueError:
                        continue
                    circuit["essential"] = bool(essential_mask & (1 << slot))

            delay_seconds = event.get("delaySeconds")
            try:
                delay_seconds = max(0, min(60, int(delay_seconds)))
            except (TypeError, ValueError):
                delay_seconds = CARD_DELAY_SECONDS
            if STATE.get("cardInserted"):
                STATE["shutdownAt"] = None
                STATE["restoreCircuitIds"] = []
            else:
                try: countdown_seconds = int(event.get("countdownSeconds"))
                except (TypeError, ValueError): countdown_seconds = -1
                STATE["shutdownAt"] = (utc_now() + timedelta(seconds=max(0, min(60, countdown_seconds)))).isoformat() if countdown_seconds >= 0 else None

            STATE["arduinoServerSequence"] = event.get("sequence")
            STATE["lastUpdated"] = changed_at
            save_state()
            await MANAGER.broadcast(state_for_client(reason="arduino_authoritative_state", source="arduino-uno-r3"))


def tariff_check_due() -> bool:
    meta = STATE.get("tariffMeta") if isinstance(STATE.get("tariffMeta"), dict) else {}
    last_checked_raw = meta.get("lastCheckedAt")
    if not last_checked_raw:
        return True
    try:
        last_checked = datetime.fromisoformat(str(last_checked_raw))
        if last_checked.tzinfo is None:
            last_checked = last_checked.replace(tzinfo=timezone.utc)
    except ValueError:
        return True
    now = utc_now()
    if meta.get("status") == "vigente":
        return (last_checked.year, last_checked.month) != (now.year, now.month)
    return now - last_checked >= timedelta(hours=TARIFF_RETRY_HOURS)


async def refresh_tariff(trigger: str = "automatic", force: bool = False) -> None:
    if not TARIFF_AUTO_UPDATE and trigger != "manual":
        return
    if not force and not tariff_check_due():
        return
    if TARIFF_REFRESH_LOCK.locked():
        return
    async with TARIFF_REFRESH_LOCK:
        checked_at = iso_now()
        async with STATE_LOCK:
            current_meta = STATE.get("tariffMeta") if isinstance(STATE.get("tariffMeta"), dict) else {}
            STATE["tariffMeta"] = {**current_meta, "status": "revisando", "lastError": None}
        try:
            result = await asyncio.to_thread(fetch_edelaysen_tariff)
        except Exception as error:
            error_message = str(error).strip() or error.__class__.__name__
            async with STATE_LOCK:
                current_meta = STATE.get("tariffMeta") if isinstance(STATE.get("tariffMeta"), dict) else {}
                STATE["tariffMeta"] = {
                    **current_meta,
                    "status": "error",
                    "lastCheckedAt": checked_at,
                    "lastError": error_message[:240],
                    "sourceUrl": EDELAYSEN_TARIFF_PAGE,
                }
                save_state()
            await MANAGER.broadcast({
                "type": "tariff_status",
                "tariff": STATE.get("tariff", TARIFF_CLP),
                "tariffMeta": STATE["tariffMeta"],
                "error": True,
                "trigger": trigger,
                "serverTime": iso_now(),
            })
            return

        async with STATE_LOCK:
            previous_meta = STATE.get("tariffMeta") if isinstance(STATE.get("tariffMeta"), dict) else {}
            previous_document = str(previous_meta.get("documentUrl") or "")
            previous_effective = str(previous_meta.get("effectiveFrom") or "")
            effective_from = str(result.get("effectiveFrom") or previous_effective or local_now().date().isoformat())
            document_url = str(result.get("documentUrl") or "")
            new_document = bool(document_url and document_url != previous_document) or effective_from != previous_effective
            STATE["tariff"] = float(result["tariff"])
            STATE["cost"] = round(float(STATE.get("energy") or 0) * STATE["tariff"], 2)
            STATE["tariffMeta"] = {
                "provider": "Edelaysen",
                "plan": "BT1 residencial",
                "status": "vigente",
                "effectiveFrom": effective_from,
                "lastCheckedAt": checked_at,
                "sourceUrl": EDELAYSEN_TARIFF_PAGE,
                "documentUrl": document_url,
                "exactVariableCharge": result.get("exactVariableCharge"),
                "fixedMonthlyCharge": result.get("fixedMonthlyCharge"),
                "components": result.get("components") or {},
                "lastError": None,
            }
            if new_document:
                notification_id = hashlib.sha256(
                    f"{effective_from}|{document_url}|{STATE['tariff']}".encode("utf-8")
                ).hexdigest()[:16]
                STATE["tariffNotification"] = {
                    "id": notification_id,
                    "message": f"Se ha actualizado el precio del kWh a ${STATE['tariff']:,.0f}.".replace(",", "."),
                    "tariff": STATE["tariff"],
                    "effectiveFrom": effective_from,
                    "createdAt": checked_at,
                }
            await persist_and_broadcast("tariff_updated" if new_document else "tariff_checked", "edelaysen")


async def tariff_update_loop() -> None:
    await asyncio.sleep(4)
    while True:
        await refresh_tariff("automatic")
        await asyncio.sleep(6 * 60 * 60)


async def delayed_card_shutdown(delay_seconds: int, source: str) -> None:
    try:
        await asyncio.sleep(max(0, delay_seconds))
        async with STATE_LOCK:
            if STATE["cardInserted"] or not STATE.get("shutdownAt"):
                return
            for circuit in STATE["circuits"]:
                if not circuit.get("essential"):
                    circuit["on"] = False
            STATE["shutdownAt"] = None
            await persist_and_broadcast("card_shutdown_complete", source)
    except asyncio.CancelledError:
        raise


async def handle_message(websocket: WebSocket, message: dict[str, Any]) -> None:
    global CARD_SHUTDOWN_TASK
    message_type = message.get("type")
    source = str(message.get("source") or MANAGER.clients.get(websocket, {}).get("id") or "client")
    active_profile = profile_by_id(message.get("profileId"))
    child_profile = active_profile if active_profile and active_profile.get("role") == "child" else None

    if message_type == "ping":
        await MANAGER.send(websocket, {"type": "pong", "sentAt": message.get("sentAt"), "serverTime": iso_now()})
        return
    if message_type == "request_history":
        await MANAGER.send(websocket, query_history(str(message.get("period") or "1m")))
        return
    if message_type == "request_state":
        await MANAGER.send(websocket, state_for_client("state", "request", source))
        await MANAGER.broadcast_presence()
        return
    if message_type == "register_client":
        client = MANAGER.clients.get(websocket)
        if client:
            client.update({key: message[key] for key in ("platform", "name", "edition") if message.get(key)})
        await MANAGER.broadcast_presence()
        return
    if str(message.get("edition") or "") != EDITION:
        await MANAGER.send(websocket, {
            "type": "command_error",
            "message": "Esta pasarela acepta únicamente clientes VoltKey Arduino Test 1.2.",
            "command": message_type,
        })
        return
    if child_profile and message_type not in {
        "set_circuit", "merge_local", "request_circuit_permission", "cancel_permission_request",
        "record_activity", "set_kids_missions",
    }:
        await MANAGER.send(websocket, {
            "type": "command_error",
            "message": "Este comando requiere un perfil normal con control absoluto.",
            "command": message_type,
        })
        return
    hardware_commands = {
        "set_circuit", "set_card", "set_grid", "set_essential", "set_relay_config",
        "set_card_led_config", "test_relay", "test_card_led", "run_hardware_self_test", "emergency_stop",
    }
    if (ARDUINO_REQUIRED and message_type in hardware_commands and ARDUINO_BRIDGE.connected
            and not ARDUINO_BRIDGE.compatible):
        await MANAGER.send(websocket, {
            "type": "command_error",
            "message": "El Arduino tiene un firmware anterior. Ejecuta Actualizar-Arduino.cmd para instalar ARDUINO TEST 1.2 antes de controlar o configurar salidas.",
            "command": message_type,
        })
        return
    if message_type == "refresh_tariff":
        await MANAGER.send(websocket, {"type": "tariff_refresh_started", "serverTime": iso_now()})
        asyncio.create_task(refresh_tariff("manual", force=True))
        return

    async with STATE_LOCK:
        reason = message_type or "unknown"
        if message_type in {"add_circuit", "archive_circuit", "restore_circuit", "delete_archived_circuit", "delete_circuit"}:
            await MANAGER.send(websocket, {
                "type": "command_error",
                "message": "Arduino Test conserva tres slots físicos fijos. Edita el circuito existente en lugar de añadirlo, archivarlo o eliminarlo.",
                "command": message_type,
            })
            return
        if message_type == "set_hardware_prototype":
            prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
            ids = [str(value) for value in message.get("circuitIds", [])][:3]
            if ids != ["1", "2", "3"]:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Arduino Test fija General, 1er piso y 2do piso en los slots 1, 2 y 3.", "command": message_type})
                return
            prototype["circuitIds"] = ids
            prototype["enabled"] = bool(message.get("enabled", True))
            prototype["lastEvent"] = {"type": "mapping_updated", "at": iso_now(), "origin": source}
            reason = "hardware_prototype_updated"
        elif message_type == "set_relay_config":
            slot = int(message.get("slot") or 0)
            pin = int(message.get("pin") or 0)
            active_low = bool(message.get("activeLow"))
            prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
            pins = list(prototype.get("relayPins") or [12, 11, 10])
            card_led_pin = int((prototype.get("cardLed") or {}).get("pin") or 13)
            if slot not in {1, 2, 3} or pin < 2 or pin > 12 or pin == card_led_pin or pin in [value for index, value in enumerate(pins) if index != slot - 1]:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Pin reservado, repetido o fuera del rango D2–D12.", "command": message_type})
                return
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.configure_relay(slot, pin, active_low):
                await MANAGER.send(websocket, {"type": "command_error", "message": "No se pudo guardar el relé en el Arduino conectado.", "command": message_type})
                return
            pins[slot - 1] = pin
            prototype["relayPins"] = pins
            mask = int(prototype.get("activeLowMask") or 0)
            prototype["activeLowMask"] = (mask | (1 << (slot - 1))) if active_low else (mask & ~(1 << (slot - 1)))
            prototype["lastEvent"] = {"type": "relay_config", "at": iso_now(), "origin": source, "slot": slot}
            reason = "relay_config_updated"
        elif message_type == "set_card_led_config":
            prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
            pins = [int(value) for value in (prototype.get("relayPins") or [12, 11, 10])]
            try:
                pin = int(message.get("pin"))
                blink_ms = int(message.get("outageBlinkMs", message.get("blinkMs", 1000)) or 1000)
            except (TypeError, ValueError):
                pin, blink_ms = 0, 1000
            active_low = bool(message.get("activeLow"))
            if pin < 2 or pin > 13 or pin in pins:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El indicador de tarjeta necesita un pin D2–D13 que no use ningún circuito.", "command": message_type})
                return
            blink_ms = min((250, 500, 1000, 2000), key=lambda value: abs(value - max(200, min(2000, blink_ms))))
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.configure_card_led(pin, active_low, blink_ms):
                await MANAGER.send(websocket, {"type": "command_error", "message": "No se pudo guardar el indicador de tarjeta en el Arduino conectado.", "command": message_type})
                return
            prototype["cardLed"] = {"pin": pin, "activeLow": active_low, "outageBlinkMs": blink_ms, "output": bool(STATE.get("cardInserted")), "mode": "steady" if STATE.get("cardInserted") and STATE.get("gridAvailable") else "off"}
            prototype["lastEvent"] = {"type": "card_led_config", "at": iso_now(), "origin": source}
            reason = "card_led_config_updated"
        elif message_type == "test_relay":
            slot = int(message.get("slot") or 0)
            command_id = str(message.get("commandId") or f"relay-{int(time.time()*1000)}")[:120]
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.test_relay(slot, 250, command_id):
                await MANAGER.send(websocket, {"type": "command_error", "message": "No se pudo ejecutar la prueba breve del relé.", "command": message_type})
                return
            STATE["hardwarePrototype"]["lastEvent"] = {"type": "relay_test", "at": iso_now(), "origin": source, "slot": slot}
            reason = "relay_test_requested"
        elif message_type == "test_card_led":
            command_id = str(message.get("commandId") or f"card-led-{int(time.time()*1000)}")[:120]
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.test_card_led(250, command_id):
                await MANAGER.send(websocket, {"type": "command_error", "message": "No se pudo ejecutar la prueba del indicador de tarjeta.", "command": message_type})
                return
            STATE["hardwarePrototype"]["lastEvent"] = {"type": "card_led_test", "at": iso_now(), "origin": source}
            reason = "card_led_test_requested"
        elif message_type == "run_hardware_self_test":
            command_id = str(message.get("commandId") or f"selftest-{int(time.time()*1000)}")[:120]
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.self_test(command_id):
                await MANAGER.send(websocket, {"type": "command_error", "message": "Conecta el Arduino para iniciar la prueba guiada.", "command": message_type})
                return
            STATE["hardwarePrototype"]["lastEvent"] = {"type": "self_test_requested", "at": iso_now(), "origin": source}
            reason = "hardware_self_test_requested"
        elif message_type == "emergency_stop":
            command_id = str(message.get("commandId") or f"emergency-{int(time.time()*1000)}")[:120]
            if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.emergency_stop(command_id):
                await MANAGER.send(websocket, {"type": "command_error", "message": "El Arduino está desconectado; no se pudo confirmar la parada física.", "command": message_type})
                return
            for circuit in STATE.get("circuits") or []:
                if not circuit.get("essential"):
                    circuit["on"] = False
                    circuit["controlUpdatedAt"] = iso_now()
            STATE["hardwarePrototype"]["lastEvent"] = {"type": "emergency_stop", "at": iso_now(), "origin": source}
            reason = "emergency_stop"
        elif message_type == "record_activity":
            raw_entry = message.get("entry")
            if not isinstance(raw_entry, dict):
                await MANAGER.send(websocket, {"type": "command_error", "message": "El registro de actividad no es válido.", "command": message_type})
                return
            entry = dict(raw_entry)
            if active_profile:
                entry.update({
                    "profileId": str(active_profile.get("id")),
                    "profileName": str(active_profile.get("name") or "Perfil"),
                    "profileRole": active_profile.get("role"),
                })
            sanitized = sanitize_activity_log([entry])
            if not sanitized:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El registro de actividad está incompleto.", "command": message_type})
                return
            existing = [item for item in STATE.get("activityLog") or [] if str(item.get("id")) != str(sanitized[0].get("id"))]
            STATE["activityLog"] = sanitize_activity_log([*existing, sanitized[0]])
            STATE["activityLogUpdatedAt"] = str(message.get("activityLogUpdatedAt") or iso_now())
            reason = "activity_recorded"
        elif message_type == "set_kids_missions":
            incoming = sanitize_kids_missions(message.get("kidsMissions"))
            if child_profile:
                preserved = {
                    key: value for key, value in (STATE.get("kidsMissions") or {}).items()
                    if str(value.get("profileId")) != str(child_profile.get("id"))
                }
                own = {
                    key: value for key, value in incoming.items()
                    if str(value.get("profileId")) == str(child_profile.get("id"))
                }
                STATE["kidsMissions"] = sanitize_kids_missions({**preserved, **own})
            else:
                STATE["kidsMissions"] = incoming
            STATE["kidsMissionsUpdatedAt"] = str(message.get("kidsMissionsUpdatedAt") or iso_now())
            reason = "kids_missions_updated"
        elif message_type == "set_card":
            inserted = bool(message.get("inserted"))
            was_inserted = bool(STATE.get("cardInserted"))
            command_id = str(message.get("commandId") or f"card-{int(time.time() * 1000)}")[:120]
            if ARDUINO_REQUIRED:
                if not ARDUINO_BRIDGE.connected:
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": "El servidor físico Arduino está desconectado. La tarjeta no cambió.",
                        "command": message_type,
                        "commandId": command_id,
                    })
                    return
                if not await ARDUINO_BRIDGE.set_card(inserted, command_id):
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": ARDUINO_BRIDGE.last_error or "El servidor Arduino no confirmó el cambio de tarjeta.",
                        "command": message_type,
                        "commandId": command_id,
                    })
                    return
            STATE["cardInserted"] = inserted
            if CARD_SHUTDOWN_TASK and not CARD_SHUTDOWN_TASK.done():
                CARD_SHUTDOWN_TASK.cancel()
            if not inserted:
                if was_inserted:
                    STATE["restoreCircuitIds"] = [
                        circuit.get("id") for circuit in STATE["circuits"]
                        if circuit.get("on") and not circuit.get("essential")
                    ]
                delay_seconds = max(0, min(60, int(message.get("delaySeconds") or CARD_DELAY_SECONDS)))
                STATE["shutdownAt"] = (utc_now() + timedelta(seconds=delay_seconds)).isoformat()
                if not ARDUINO_REQUIRED:
                    CARD_SHUTDOWN_TASK = asyncio.create_task(delayed_card_shutdown(delay_seconds, source))
            else:
                STATE["shutdownAt"] = None
                if not ARDUINO_REQUIRED and STATE.get("gridAvailable"):
                    restore_ids = {str(value) for value in STATE.get("restoreCircuitIds") or []}
                    for circuit in STATE["circuits"]:
                        if str(circuit.get("id")) in restore_ids:
                            circuit["on"] = True
                if not ARDUINO_REQUIRED:
                    STATE["restoreCircuitIds"] = []
            reason = "card_inserted" if inserted else "card_removed"
        elif message_type == "set_circuit":
            circuit = circuit_by_id(message.get("id"))
            command_id = str(message.get("commandId") or "")[:120] or None
            if not circuit:
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "El circuito ya no existe o fue eliminado.",
                    "command": message_type,
                    "commandId": command_id,
                })
                return
            if child_profile and not child_allows_circuit(child_profile, message.get("id")):
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "El circuito no está autorizado para este perfil VoltKids.",
                    "command": message_type,
                    "commandId": command_id,
                })
                return
            if child_profile and circuit.get("adminLocked"):
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "La decisión del administrador tiene prioridad. El control debe liberarse antes de que VoltKids pueda cambiar este circuito.",
                    "command": message_type,
                    "commandId": command_id,
                })
                return
            requested = bool(message.get("on"))
            prototype_ids = [str(value) for value in STATE.get("hardwarePrototype", {}).get("circuitIds", ["1", "2", "3"])]
            try:
                hardware_slot = prototype_ids.index(str(circuit.get("id"))) + 1
            except ValueError:
                hardware_slot = None
            mapped_to_arduino = hardware_slot is not None
            if hardware_slot in {2, 3} and requested:
                general = circuit_by_id(prototype_ids[0])
                if not general or not general.get("on"):
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": "Enciende primero el circuito General; los pisos dependen de él.",
                        "command": message_type,
                        "commandId": command_id,
                    })
                    return
            if ARDUINO_REQUIRED and mapped_to_arduino:
                if not ARDUINO_BRIDGE.connected:
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": "El servidor físico Arduino está desconectado. El circuito no cambió.",
                        "command": message_type,
                        "commandId": command_id,
                    })
                    return
                if not await ARDUINO_BRIDGE.set_circuit(hardware_slot, requested, command_id or "app"):
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": "El servidor Arduino no recibió la orden del circuito.",
                        "command": message_type,
                        "commandId": command_id,
                    })
                    return
            allowed = circuit.get("essential") or (STATE["cardInserted"] and STATE["gridAvailable"])
            circuit["on"] = requested if allowed else False
            changed_at = iso_now()
            if child_profile:
                circuit["adminLocked"] = False
                circuit["adminDecisionAt"] = None
                circuit["adminProfileId"] = None
            else:
                if circuit.get("adminLocked"):
                    circuit["adminDecisionAt"] = changed_at
                    circuit["adminProfileId"] = str(active_profile.get("id")) if active_profile else None
                else:
                    circuit["adminDecisionAt"] = None
                    circuit["adminProfileId"] = None
            circuit["controlUpdatedAt"] = changed_at
            circuit["lastControlCommandId"] = command_id
            if hardware_slot == 1 and not circuit["on"]:
                for subordinate_id in prototype_ids[1:3]:
                    subordinate = circuit_by_id(subordinate_id)
                    if subordinate:
                        subordinate["on"] = False
                        subordinate["controlUpdatedAt"] = changed_at
            if child_profile and bool(circuit.get("on")) == requested:
                one_time_grant = next((request for request in STATE.get("permissionRequests") or []
                                       if request.get("grantScope") == "once"
                                       and permission_grant_is_active(request, child_profile.get("id"), circuit.get("id"))), None)
                if one_time_grant:
                    one_time_grant.update({"status": "used", "remainingUses": 0})
                    STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
                    STATE["permissionRequestsUpdatedAt"] = changed_at
        elif message_type == "request_circuit_permission":
            if not child_profile:
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "Solo un perfil VoltKids puede crear esta solicitud.",
                    "command": message_type,
                })
                return
            circuit = circuit_by_id(message.get("circuitId"))
            if not circuit:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El circuito solicitado no existe.", "command": message_type})
                return
            if child_allows_circuit(child_profile, circuit.get("id")):
                await MANAGER.send(websocket, {"type": "command_error", "message": "Este circuito ya está autorizado para VoltKids.", "command": message_type})
                return
            duplicate = next((item for item in STATE.get("permissionRequests") or []
                              if item.get("status") == "pending"
                              and str(item.get("profileId")) == str(child_profile.get("id"))
                              and str(item.get("circuitId")) == str(circuit.get("id"))), None)
            if duplicate:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Ya existe una solicitud pendiente para este circuito.", "command": message_type})
                return
            created_at = iso_now()
            request = {
                "id": f"permission-{uuid.uuid4().hex}",
                "profileId": str(child_profile.get("id")),
                "profileName": str(child_profile.get("name") or "VoltKids"),
                "circuitId": circuit.get("id"),
                "circuitName": str(circuit.get("name") or "Circuito"),
                "status": "pending",
                "createdAt": created_at,
                "resolvedAt": None,
                "resolvedBy": None,
            }
            STATE["permissionRequests"] = sanitize_permission_requests([*(STATE.get("permissionRequests") or []), request])
            STATE["permissionRequestsUpdatedAt"] = created_at
            reason = "permission_requested"
        elif message_type == "cancel_permission_request":
            if not child_profile:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Solo VoltKids puede cancelar su propia solicitud.", "command": message_type})
                return
            request = next((item for item in STATE.get("permissionRequests") or [] if str(item.get("id")) == str(message.get("requestId"))), None)
            if not request or request.get("status") != "pending" or str(request.get("profileId")) != str(child_profile.get("id")):
                await MANAGER.send(websocket, {"type": "command_error", "message": "La solicitud no está disponible para cancelarla.", "command": message_type})
                return
            resolved_at = iso_now()
            request.update({"status": "cancelled", "resolvedAt": resolved_at, "resolvedBy": str(child_profile.get("id"))})
            STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
            STATE["permissionRequestsUpdatedAt"] = resolved_at
            reason = "permission_request_cancelled"
        elif message_type == "resolve_permission_request":
            if not active_profile or active_profile.get("role") != "normal":
                await MANAGER.send(websocket, {"type": "command_error", "message": "Solo un administrador puede responder solicitudes VoltKids.", "command": message_type})
                return
            decision = str(message.get("decision") or "")
            request = next((item for item in STATE.get("permissionRequests") or [] if str(item.get("id")) == str(message.get("requestId"))), None)
            if decision not in {"approved", "denied"} or not request or request.get("status") != "pending":
                await MANAGER.send(websocket, {"type": "command_error", "message": "La solicitud o la decisión ya no es válida.", "command": message_type})
                return
            child = profile_by_id(request.get("profileId"))
            circuit = circuit_by_id(request.get("circuitId"))
            if not child or child.get("role") != "child" or not circuit:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El perfil o circuito solicitado ya no existe.", "command": message_type})
                return
            resolved_at = iso_now()
            grant_scope = str(message.get("grantScope") or "permanent")
            if grant_scope not in {"once", "hour", "permanent"}:
                grant_scope = "permanent"
            expires_at = (utc_now() + timedelta(hours=1)).isoformat() if decision == "approved" and grant_scope == "hour" else None
            request.update({
                "status": decision,
                "resolvedAt": resolved_at,
                "resolvedBy": str(active_profile.get("id")),
                "grantScope": grant_scope if decision == "approved" else None,
                "expiresAt": expires_at,
                "remainingUses": 1 if decision == "approved" and grant_scope == "once" else None,
            })
            permanent_ids = {str(value) for value in child.get("allowedCircuitIds") or []}
            if decision == "approved" and grant_scope == "permanent" and str(circuit.get("id")) not in permanent_ids:
                child["allowedCircuitIds"] = [*(child.get("allowedCircuitIds") or []), circuit.get("id")]
                child["updatedAt"] = resolved_at
                STATE["profiles"] = sanitize_profiles(STATE.get("profiles"))
                STATE["profilesUpdatedAt"] = resolved_at
            STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
            STATE["permissionRequestsUpdatedAt"] = resolved_at
            reason = "permission_request_resolved"
        elif message_type == "set_circuit_lock":
            circuit = circuit_by_id(message.get("id"))
            if circuit:
                locked = bool(message.get("locked"))
                updated_at = iso_now()
                circuit["adminLocked"] = locked
                circuit["adminDecisionAt"] = updated_at if locked else None
                circuit["adminProfileId"] = str(active_profile.get("id")) if locked and active_profile else None
                circuit["controlUpdatedAt"] = updated_at
        elif message_type == "release_circuit_control":
            circuit = circuit_by_id(message.get("id"))
            if circuit:
                circuit["adminLocked"] = False
                circuit["adminDecisionAt"] = None
                circuit["adminProfileId"] = None
                circuit["controlUpdatedAt"] = iso_now()
        elif message_type == "set_essential":
            circuit = circuit_by_id(message.get("id"))
            if circuit:
                previous_essential = bool(circuit.get("essential"))
                circuit["essential"] = bool(message.get("essential"))
                mapped_to_arduino = str(circuit.get("id")) in {str(value) for value in ARDUINO_BRIDGE.MAPPED_CIRCUITS}
                if ARDUINO_REQUIRED and mapped_to_arduino:
                    if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.configure_policy(physical_circuit_slots(), CARD_DELAY_SECONDS):
                        circuit["essential"] = previous_essential
                        await MANAGER.send(websocket, {
                            "type": "command_error",
                            "message": "No se pudo guardar la política esencial en el servidor Arduino.",
                            "command": message_type,
                        })
                        return
                if not circuit["essential"] and (not STATE["cardInserted"] or not STATE["gridAvailable"]):
                    circuit["on"] = False
        elif message_type == "set_grid":
            available = bool(message.get("available"))
            command_id = str(message.get("commandId") or f"grid-{int(time.time() * 1000)}")[:120]
            if ARDUINO_REQUIRED:
                if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.set_grid(available, command_id):
                    await MANAGER.send(websocket, {
                        "type": "command_error",
                        "message": ARDUINO_BRIDGE.last_error or "El servidor Arduino no confirmó el estado de red.",
                        "command": message_type,
                    })
                    return
            STATE["gridAvailable"] = available
            if not STATE["gridAvailable"]:
                for circuit in STATE["circuits"]:
                    if not circuit.get("essential"):
                        circuit["on"] = False
        elif message_type == "add_circuit":
            raw = message.get("circuit")
            if isinstance(raw, dict) and circuit_by_id(raw.get("id")) is None:
                sanitized = sanitize_circuit_catalog([raw], [])
                if sanitized:
                    STATE["circuits"].append(sanitized[0])
                    STATE["circuitCatalogUpdatedAt"] = str(message.get("circuitCatalogUpdatedAt") or iso_now())
        elif message_type == "archive_circuit":
            circuit = circuit_by_id(message.get("id"))
            if not circuit:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El circuito que intentas archivar ya no existe.", "command": message_type})
                return
            archived_raw = dict(circuit)
            if isinstance(message.get("archivedCircuit"), dict):
                archived_raw.update(message["archivedCircuit"])
            archived_raw.update({"on": False, "adminLocked": False, "archivedAt": archived_raw.get("archivedAt") or iso_now()})
            remaining_archive = [item for item in STATE.get("archivedCircuits") or [] if str(item.get("id")) != str(circuit.get("id"))]
            STATE["archivedCircuits"] = sanitize_archived_circuits([*remaining_archive, archived_raw])
            STATE["archivedCircuitsUpdatedAt"] = str(message.get("archivedCircuitsUpdatedAt") or iso_now())
            STATE["circuits"] = [item for item in STATE["circuits"] if str(item.get("id")) != str(circuit.get("id"))]
            STATE["circuitCatalogUpdatedAt"] = str(message.get("circuitCatalogUpdatedAt") or iso_now())
            clean_circuit_references()
            reason = "circuit_archived"
        elif message_type == "restore_circuit":
            raw = message.get("circuit")
            sanitized = sanitize_circuit_catalog([raw], []) if isinstance(raw, dict) else []
            if not sanitized:
                await MANAGER.send(websocket, {"type": "command_error", "message": "El circuito archivado no se puede restaurar.", "command": message_type})
                return
            restored = sanitized[0]
            if circuit_by_id(restored.get("id")) is not None:
                restored["id"] = f"restored-{uuid.uuid4().hex[:12]}"
            restored.update({"on": False, "adminLocked": False, "adminDecisionAt": None, "adminProfileId": None, "controlUpdatedAt": iso_now()})
            STATE["circuits"].append(restored)
            STATE["archivedCircuits"] = sanitize_archived_circuits([
                item for item in STATE.get("archivedCircuits") or []
                if str(item.get("id")) != str(raw.get("id"))
            ])
            STATE["circuitCatalogUpdatedAt"] = str(message.get("circuitCatalogUpdatedAt") or iso_now())
            STATE["archivedCircuitsUpdatedAt"] = str(message.get("archivedCircuitsUpdatedAt") or iso_now())
            reason = "circuit_restored"
        elif message_type == "delete_archived_circuit":
            circuit_id = message.get("id")
            STATE["archivedCircuits"] = sanitize_archived_circuits([
                item for item in STATE.get("archivedCircuits") or []
                if str(item.get("id")) != str(circuit_id)
            ])
            STATE["archivedCircuitsUpdatedAt"] = str(message.get("archivedCircuitsUpdatedAt") or iso_now())
            reason = "archived_circuit_deleted"
        elif message_type == "restore_backup":
            backup = message.get("backup")
            if not isinstance(backup, dict) or backup.get("voltkeyBackup") is not True or backup.get("schema") != "voltkey-config-v1":
                await MANAGER.send(websocket, {"type": "command_error", "message": "La copia de seguridad no es compatible con VoltKey.", "command": message_type})
                return
            restored_circuits = sanitize_circuit_catalog(backup.get("circuits"), [])
            restored_profiles = sanitize_profiles(backup.get("profiles"))
            if not restored_circuits or not any(profile.get("role") == "normal" for profile in restored_profiles):
                await MANAGER.send(websocket, {"type": "command_error", "message": "El respaldo no contiene circuitos y perfiles válidos.", "command": message_type})
                return
            restored_schedules: list[dict[str, Any]] = []
            for raw_schedule in backup.get("schedules") or []:
                try:
                    restored_schedules.append(sanitize_schedule(raw_schedule))
                except (TypeError, ValueError):
                    continue
            restored_at = str(message.get("restoredAt") or iso_now())
            STATE["circuits"] = restored_circuits
            STATE["circuitCatalogUpdatedAt"] = restored_at
            STATE["archivedCircuits"] = sanitize_archived_circuits(backup.get("archivedCircuits"))
            STATE["archivedCircuitsUpdatedAt"] = restored_at
            STATE["schedules"] = restored_schedules
            STATE["schedulePhases"] = {}
            STATE["profiles"] = restored_profiles
            STATE["profilesUpdatedAt"] = restored_at
            STATE["anomalyReviews"] = sanitize_anomaly_reviews(backup.get("anomalyReviews"))
            STATE["anomalyReviewsUpdatedAt"] = restored_at
            try:
                restored_threshold = float(backup.get("anomalyPowerThreshold"))
            except (TypeError, ValueError):
                restored_threshold = DEFAULT_ANOMALY_POWER_THRESHOLD
            STATE["anomalyPowerThreshold"] = max(100.0, min(50000.0, restored_threshold))
            STATE["anomalySettingsUpdatedAt"] = restored_at
            STATE["permissionRequests"] = sanitize_permission_requests(backup.get("permissionRequests"))
            STATE["permissionRequestsUpdatedAt"] = restored_at
            STATE["kidsMissions"] = sanitize_kids_missions(backup.get("kidsMissions"))
            STATE["kidsMissionsUpdatedAt"] = restored_at
            clean_circuit_references()
            reason = "backup_restored"
        elif message_type == "merge_local":
            if not child_profile:
                incoming_catalog_at = message.get("circuitCatalogUpdatedAt")
                if timestamp_is_newer(incoming_catalog_at, STATE.get("circuitCatalogUpdatedAt")) and isinstance(message.get("circuitCatalog"), list):
                    current_by_id = {str(item.get("id")): item for item in STATE.get("circuits") or []}
                    incoming_catalog = sanitize_circuit_catalog(message.get("circuitCatalog"), [])
                    for incoming_circuit in incoming_catalog:
                        current_circuit = current_by_id.get(str(incoming_circuit.get("id")))
                        if not current_circuit or not timestamp_is_newer(current_circuit.get("controlUpdatedAt"), incoming_circuit.get("controlUpdatedAt")):
                            continue
                        incoming_circuit.update({
                            "on": bool(current_circuit.get("on")),
                            "adminLocked": bool(current_circuit.get("adminLocked")),
                            "adminDecisionAt": current_circuit.get("adminDecisionAt"),
                            "adminProfileId": current_circuit.get("adminProfileId"),
                            "controlUpdatedAt": current_circuit.get("controlUpdatedAt"),
                            "lastControlCommandId": current_circuit.get("lastControlCommandId"),
                        })
                    STATE["circuits"] = incoming_catalog
                    STATE["circuitCatalogUpdatedAt"] = str(incoming_catalog_at)
                    clean_circuit_references()
                    reason = "circuit_catalog_merged"
                for raw in message.get("circuits") or []:
                    if isinstance(raw, dict) and circuit_by_id(raw.get("id")) is None:
                        sanitized = sanitize_circuit_catalog([raw], [])
                        if sanitized:
                            STATE["circuits"].append(sanitized[0])
                for raw_control in message.get("circuitControls") or []:
                    if not isinstance(raw_control, dict):
                        continue
                    circuit = circuit_by_id(raw_control.get("id"))
                    if not circuit or not timestamp_is_newer(raw_control.get("controlUpdatedAt"), circuit.get("controlUpdatedAt")):
                        continue
                    requested = bool(raw_control.get("on"))
                    allowed = circuit.get("essential") or (STATE["cardInserted"] and STATE["gridAvailable"])
                    circuit["on"] = requested if allowed else False
                    circuit["adminLocked"] = bool(raw_control.get("adminLocked"))
                    circuit["adminDecisionAt"] = str(raw_control.get("adminDecisionAt")) if raw_control.get("adminDecisionAt") else None
                    circuit["adminProfileId"] = str(raw_control.get("adminProfileId")) if raw_control.get("adminProfileId") else None
                    circuit["controlUpdatedAt"] = str(raw_control.get("controlUpdatedAt"))
                    circuit["lastControlCommandId"] = str(raw_control.get("lastControlCommandId"))[:120] if raw_control.get("lastControlCommandId") else None
                known_schedule_ids = {str(item.get("id")) for item in STATE["schedules"]}
                for raw_schedule in message.get("schedules") or []:
                    if not isinstance(raw_schedule, dict) or str(raw_schedule.get("id")) in known_schedule_ids:
                        continue
                    try:
                        schedule = sanitize_schedule(raw_schedule)
                    except ValueError:
                        continue
                    STATE["schedules"].append(schedule)
                    STATE.setdefault("schedulePhases", {}).pop(str(schedule.get("circuitId")), None)
                    known_schedule_ids.add(str(schedule["id"]))
                incoming_profiles_at = message.get("profilesUpdatedAt")
                if timestamp_is_newer(incoming_profiles_at, STATE.get("profilesUpdatedAt")):
                    STATE["profiles"] = sanitize_profiles(message.get("profiles"))
                    STATE["profilesUpdatedAt"] = str(incoming_profiles_at)
                    clean_circuit_references()
                    reason = "profiles_merged"
                incoming_reviews_at = message.get("anomalyReviewsUpdatedAt")
                if timestamp_is_newer(incoming_reviews_at, STATE.get("anomalyReviewsUpdatedAt")):
                    STATE["anomalyReviews"] = sanitize_anomaly_reviews(message.get("anomalyReviews"))
                    STATE["anomalyReviewsUpdatedAt"] = str(incoming_reviews_at)
                    reason = "anomaly_reviews_merged"
                incoming_settings_at = message.get("anomalySettingsUpdatedAt")
                if timestamp_is_newer(incoming_settings_at, STATE.get("anomalySettingsUpdatedAt")):
                    try:
                        incoming_threshold = float(message.get("anomalyPowerThreshold"))
                    except (TypeError, ValueError):
                        incoming_threshold = 0
                    if 100 <= incoming_threshold <= 50000:
                        STATE["anomalyPowerThreshold"] = incoming_threshold
                        STATE["anomalySettingsUpdatedAt"] = str(incoming_settings_at)
                        reason = "anomaly_settings_merged"
                incoming_archive_at = message.get("archivedCircuitsUpdatedAt")
                if timestamp_is_newer(incoming_archive_at, STATE.get("archivedCircuitsUpdatedAt")):
                    STATE["archivedCircuits"] = sanitize_archived_circuits(message.get("archivedCircuits"))
                    STATE["archivedCircuitsUpdatedAt"] = str(incoming_archive_at)
                    reason = "archived_circuits_merged"
                incoming_activity_at = message.get("activityLogUpdatedAt")
                if timestamp_is_newer(incoming_activity_at, STATE.get("activityLogUpdatedAt")):
                    combined_activity = [*(STATE.get("activityLog") or []), *(message.get("activityLog") or [])]
                    STATE["activityLog"] = sanitize_activity_log(combined_activity)
                    STATE["activityLogUpdatedAt"] = str(incoming_activity_at)
                    reason = "activity_log_merged"
                incoming_missions_at = message.get("kidsMissionsUpdatedAt")
                if timestamp_is_newer(incoming_missions_at, STATE.get("kidsMissionsUpdatedAt")):
                    STATE["kidsMissions"] = sanitize_kids_missions(message.get("kidsMissions"))
                    STATE["kidsMissionsUpdatedAt"] = str(incoming_missions_at)
                    reason = "kids_missions_merged"
            else:
                incoming_activity_at = message.get("activityLogUpdatedAt")
                if timestamp_is_newer(incoming_activity_at, STATE.get("activityLogUpdatedAt")):
                    own_entries = [
                        entry for entry in sanitize_activity_log(message.get("activityLog"))
                        if str(entry.get("profileId")) == str(child_profile.get("id"))
                    ]
                    preserved_entries = [
                        entry for entry in STATE.get("activityLog") or []
                        if str(entry.get("profileId")) != str(child_profile.get("id"))
                    ]
                    STATE["activityLog"] = sanitize_activity_log([*preserved_entries, *own_entries])
                    STATE["activityLogUpdatedAt"] = str(incoming_activity_at)
                    reason = "activity_log_merged"
                incoming_missions_at = message.get("kidsMissionsUpdatedAt")
                if timestamp_is_newer(incoming_missions_at, STATE.get("kidsMissionsUpdatedAt")):
                    incoming_missions = sanitize_kids_missions(message.get("kidsMissions"))
                    preserved_missions = {
                        key: value for key, value in (STATE.get("kidsMissions") or {}).items()
                        if str(value.get("profileId")) != str(child_profile.get("id"))
                    }
                    own_missions = {
                        key: value for key, value in incoming_missions.items()
                        if str(value.get("profileId")) == str(child_profile.get("id"))
                    }
                    STATE["kidsMissions"] = sanitize_kids_missions({**preserved_missions, **own_missions})
                    STATE["kidsMissionsUpdatedAt"] = str(incoming_missions_at)
                    reason = "kids_missions_merged"
            incoming_requests_at = message.get("permissionRequestsUpdatedAt")
            if timestamp_is_newer(incoming_requests_at, STATE.get("permissionRequestsUpdatedAt")):
                incoming_requests = sanitize_permission_requests(message.get("permissionRequests"))
                requests_merged = False
                if child_profile:
                    existing_requests = list(STATE.get("permissionRequests") or [])
                    existing_ids = {str(item.get("id")) for item in existing_requests}
                    existing_pending = {
                        (str(item.get("profileId")), str(item.get("circuitId")))
                        for item in existing_requests if item.get("status") == "pending"
                    }
                    for request in incoming_requests:
                        request_key = (str(request.get("profileId")), str(request.get("circuitId")))
                        if (request.get("status") != "pending"
                                or str(request.get("profileId")) != str(child_profile.get("id"))
                                or str(request.get("id")) in existing_ids
                                or request_key in existing_pending):
                            continue
                        circuit = circuit_by_id(request.get("circuitId"))
                        if not circuit or child_allows_circuit(child_profile, request.get("circuitId")):
                            continue
                        request["profileName"] = str(child_profile.get("name") or "VoltKids")
                        request["circuitName"] = str(circuit.get("name") or "Circuito")
                        existing_requests.append(request)
                        existing_ids.add(str(request.get("id")))
                        existing_pending.add(request_key)
                        requests_merged = True
                    STATE["permissionRequests"] = sanitize_permission_requests(existing_requests)
                else:
                    STATE["permissionRequests"] = incoming_requests
                    requests_merged = True
                if requests_merged:
                    STATE["permissionRequestsUpdatedAt"] = str(incoming_requests_at)
                    reason = "permission_requests_merged"
        elif message_type == "set_profiles":
            if not active_profile or active_profile.get("role") != "normal":
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "Solo un perfil normal puede administrar perfiles familiares.",
                    "command": message_type,
                })
                return
            STATE["profiles"] = sanitize_profiles(message.get("profiles"))
            profiles_updated_at = str(message.get("profilesUpdatedAt") or iso_now())
            STATE["profilesUpdatedAt"] = profiles_updated_at
            valid_child_ids = {str(profile.get("id")) for profile in STATE["profiles"] if profile.get("role") == "child"}
            cancelled_request = False
            for request in STATE.get("permissionRequests") or []:
                if request.get("status") in {"pending", "approved"} and str(request.get("profileId")) not in valid_child_ids:
                    request.update({"status": "cancelled", "resolvedAt": profiles_updated_at, "resolvedBy": str(active_profile.get("id"))})
                    cancelled_request = True
            if cancelled_request:
                STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
                STATE["permissionRequestsUpdatedAt"] = profiles_updated_at
            reason = "set_profiles"
        elif message_type == "set_anomaly_review":
            if not active_profile or active_profile.get("role") != "normal":
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "Solo un administrador puede actualizar el seguimiento de anomalías.",
                    "command": message_type,
                })
                return
            key = str(message.get("key") or "").strip()[:300]
            review = message.get("review")
            if not key or not isinstance(review, dict):
                await MANAGER.send(websocket, {"type": "command_error", "message": "Seguimiento de anomalía no válido.", "command": message_type})
                return
            merged_reviews = dict(STATE.get("anomalyReviews") or {})
            merged_reviews[key] = review
            STATE["anomalyReviews"] = sanitize_anomaly_reviews(merged_reviews)
            STATE["anomalyReviewsUpdatedAt"] = str(message.get("anomalyReviewsUpdatedAt") or iso_now())
            reason = "set_anomaly_review"
        elif message_type == "set_anomaly_settings":
            if not active_profile or active_profile.get("role") != "normal":
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "Solo un administrador puede cambiar el límite de anomalías.",
                    "command": message_type,
                })
                return
            try:
                threshold = float(message.get("anomalyPowerThreshold"))
            except (TypeError, ValueError):
                threshold = 0
            if not 100 <= threshold <= 50000:
                await MANAGER.send(websocket, {
                    "type": "command_error",
                    "message": "El límite debe estar entre 100 y 50.000 W.",
                    "command": message_type,
                })
                return
            STATE["anomalyPowerThreshold"] = threshold
            STATE["anomalySettingsUpdatedAt"] = str(message.get("anomalySettingsUpdatedAt") or iso_now())
            reason = "set_anomaly_settings"
        elif message_type == "update_circuit":
            raw = message.get("circuit")
            if isinstance(raw, dict):
                existing = circuit_by_id(raw.get("id"))
                if existing:
                    previous_essential = bool(existing.get("essential"))
                    protected_control = {
                        "adminLocked": bool(existing.get("adminLocked")),
                        "adminDecisionAt": existing.get("adminDecisionAt"),
                        "adminProfileId": existing.get("adminProfileId"),
                        "controlUpdatedAt": existing.get("controlUpdatedAt"),
                        "lastControlCommandId": existing.get("lastControlCommandId"),
                    }
                    existing.update(raw)
                    existing.update(protected_control)
                    sanitized = sanitize_circuit_catalog([existing], [])
                    if sanitized:
                        existing.clear()
                        existing.update(sanitized[0])
                    if bool(existing.get("essential")) != previous_essential and ARDUINO_REQUIRED:
                        if not ARDUINO_BRIDGE.connected or not await ARDUINO_BRIDGE.configure_policy(physical_circuit_slots(), CARD_DELAY_SECONDS):
                            existing["essential"] = previous_essential
                            await MANAGER.send(websocket, {
                                "type": "command_error",
                                "message": "El circuito se editó, pero la prioridad no cambió porque el Arduino no confirmó la política física.",
                                "command": message_type,
                            })
                    STATE["circuitCatalogUpdatedAt"] = str(message.get("circuitCatalogUpdatedAt") or iso_now())
        elif message_type == "delete_circuit":
            circuit_id = message.get("id")
            STATE["circuits"] = [item for item in STATE["circuits"] if str(item.get("id")) != str(circuit_id)]
            STATE["schedules"] = [item for item in STATE["schedules"] if str(item.get("circuitId")) != str(circuit_id)]
            STATE.setdefault("schedulePhases", {}).pop(str(circuit_id), None)
            STATE["circuitCatalogUpdatedAt"] = str(message.get("circuitCatalogUpdatedAt") or iso_now())
            for profile in STATE.get("profiles") or []:
                if profile.get("role") == "child":
                    profile["allowedCircuitIds"] = [value for value in profile.get("allowedCircuitIds") or [] if str(value) != str(circuit_id)]
            resolved_at = iso_now()
            cancelled_request = False
            for request in STATE.get("permissionRequests") or []:
                if request.get("status") in {"pending", "approved"} and str(request.get("circuitId")) == str(circuit_id):
                    request.update({"status": "cancelled", "resolvedAt": resolved_at, "resolvedBy": str(active_profile.get("id")) if active_profile else None})
                    cancelled_request = True
            if cancelled_request:
                STATE["permissionRequests"] = sanitize_permission_requests(STATE.get("permissionRequests"))
                STATE["permissionRequestsUpdatedAt"] = resolved_at
        elif message_type == "set_schedule":
            try:
                schedule = sanitize_schedule(message.get("schedule") or {})
            except ValueError as error:
                await MANAGER.send(websocket, {"type": "command_error", "message": str(error), "command": message_type})
                return
            existing_index = next((index for index, item in enumerate(STATE["schedules"]) if str(item.get("id")) == str(schedule["id"])), None)
            if existing_index is not None:
                STATE.setdefault("schedulePhases", {}).pop(str(STATE["schedules"][existing_index].get("circuitId")), None)
            STATE.setdefault("schedulePhases", {}).pop(str(schedule.get("circuitId")), None)
            if existing_index is None:
                STATE["schedules"].append(schedule)
            else:
                STATE["schedules"][existing_index] = schedule
        elif message_type == "delete_schedule":
            schedule_id = message.get("id")
            deleted = next((item for item in STATE["schedules"] if str(item.get("id")) == str(schedule_id)), None)
            if deleted:
                STATE.setdefault("schedulePhases", {}).pop(str(deleted.get("circuitId")), None)
            STATE["schedules"] = [item for item in STATE["schedules"] if str(item.get("id")) != str(schedule_id)]
        elif message_type == "update_tariff":
            tariff = float(message.get("tariff") or 0)
            if tariff > 0:
                STATE["tariff"] = tariff
                current_meta = STATE.get("tariffMeta") if isinstance(STATE.get("tariffMeta"), dict) else {}
                STATE["tariffMeta"] = {**current_meta, "status": "manual", "lastCheckedAt": iso_now(), "lastError": None}
        elif message_type == "telemetry_input":
            if SIMULATION:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Desactiva VOLTKEY_SIMULATION para recibir un medidor externo.", "command": message_type})
                return
            try:
                voltage_raw = message.get("voltage") if message.get("voltage") is not None else (STATE.get("voltage") or NOMINAL_VOLTAGE)
                power_raw = message.get("power") if message.get("power") is not None else (STATE.get("power") or 0)
                voltage = float(voltage_raw)
                power = float(power_raw)
                current_raw = message.get("current") if message.get("current") is not None else (power / max(voltage, 1))
                current = float(current_raw)
                supplied_energy = None if message.get("energy") is None else float(message["energy"])
            except (TypeError, ValueError):
                await MANAGER.send(websocket, {"type": "command_error", "message": "La telemetría debe contener valores numéricos.", "command": message_type})
                return
            if not 0 < voltage < 500 or not 0 <= power < 100_000 or not 0 <= current < 500:
                await MANAGER.send(websocket, {"type": "command_error", "message": "Telemetría fuera de los límites aceptados.", "command": message_type})
                return
            STATE["voltage"] = round(voltage, 2)
            STATE["power"] = round(power, 1)
            STATE["current"] = round(current, 3)
            if supplied_energy is not None:
                STATE["energy"] = max(0, round(supplied_energy, 5))
        elif message_type == "card_shutdown_complete":
            for circuit in STATE["circuits"]:
                if not circuit.get("essential"):
                    circuit["on"] = False
            STATE["shutdownAt"] = None
        else:
            await MANAGER.send(websocket, {"type": "command_error", "message": "Comando no reconocido", "command": message_type})
            return
        STATE["edition"] = EDITION
        STATE["arduinoTestEdition"] = ARDUINO_TEST_VERSION
        STATE["circuits"] = enforce_arduino_test_catalog(STATE.get("circuits"))
        STATE["archivedCircuits"] = []
        STATE["schedules"] = [
            schedule for schedule in STATE.get("schedules") or []
            if str(schedule.get("circuitId")) in {"1", "2", "3"}
        ]
        prototype = STATE.setdefault("hardwarePrototype", initial_state()["hardwarePrototype"])
        prototype["labels"] = ["General", "1er piso", "2do piso"]
        prototype["circuitIds"] = ["1", "2", "3"]
        for profile in STATE.get("profiles") or []:
            if profile.get("role") == "child":
                profile["allowedCircuitIds"] = [
                    value for value in profile.get("allowedCircuitIds") or []
                    if str(value) in {"2", "3"}
                ]
        await persist_and_broadcast(reason, source)


async def system_loop() -> None:
    last_record = time.monotonic()
    last_tick = time.monotonic()
    while True:
        await asyncio.sleep(5)
        now_monotonic = time.monotonic()
        elapsed = max(0.1, now_monotonic - last_tick)
        last_tick = now_monotonic
        async with STATE_LOCK:
            shutdown_completed = False
            grants_expired = expire_permission_grants()
            if (not ARDUINO_REQUIRED
                    and not STATE.get("cardInserted")
                    and STATE.get("shutdownAt")
                    and card_blocks_nonessential()):
                for circuit in STATE["circuits"]:
                    if not circuit.get("essential"):
                        circuit["on"] = False
                STATE["shutdownAt"] = None
                shutdown_completed = True
            schedule_changes = evaluate_schedules()
            if schedule_changes and ARDUINO_REQUIRED and ARDUINO_BRIDGE.connected:
                await ARDUINO_BRIDGE.reconcile_circuits(physical_circuit_slots(), "schedule")
            nominal_power = sum(float(circuit.get("power") or 0) for circuit in STATE["circuits"] if circuit.get("on"))
            if SIMULATION:
                voltage = NOMINAL_VOLTAGE + math.sin(time.time() / 37) * 2.8 + random.uniform(-0.8, 0.8)
                measured_power = nominal_power * (0.94 + random.random() * 0.09)
            else:
                voltage = float(STATE.get("voltage") or NOMINAL_VOLTAGE)
                measured_power = float(STATE.get("power") or 0)
            current = measured_power / max(voltage, 1)
            energy_delta = measured_power / 1000 * elapsed / 3600
            STATE["voltage"] = round(voltage, 2)
            STATE["power"] = round(measured_power, 1)
            STATE["current"] = round(current, 3)
            STATE["energy"] = round(float(STATE.get("energy") or 0) + energy_delta, 5)
            STATE["cost"] = round(STATE["energy"] * float(STATE.get("tariff") or TARIFF_CLP), 2)
            effective_capacity = BATTERY_CAPACITY_KWH * max(0.1, float(STATE.get("batteryHealth") or 94.0) / 100)
            if not STATE["gridAvailable"]:
                essential_power_kw = sum(
                    float(circuit.get("power") or 0) for circuit in STATE["circuits"]
                    if circuit.get("on") and circuit.get("essential")
                ) / 1000
                discharge_kw = essential_power_kw / BATTERY_INVERTER_EFFICIENCY
                discharge_percent = discharge_kw / effective_capacity * 100 * elapsed / 3600
                STATE["battery"] = max(5, round(float(STATE.get("battery") or 0) - discharge_percent, 2))
            elif float(STATE.get("battery") or 0) < 100:
                charge_percent = BATTERY_CHARGE_POWER_KW / effective_capacity * 100 * elapsed / 3600
                STATE["battery"] = min(100, round(float(STATE.get("battery") or 0) + charge_percent, 2))
            target_temperature = 26.0 + min(6.0, measured_power / 1200) + (1.5 if not STATE["gridAvailable"] else 0.0)
            current_temperature = float(STATE.get("batteryTemperature") or 27.0)
            STATE["batteryTemperature"] = round(current_temperature + (target_temperature - current_temperature) * 0.18, 1)
            if voltage < NOMINAL_VOLTAGE * 0.9:
                record_anomaly("voltage", "Caída de voltaje", voltage, "V", "warning", "Voltaje inferior al 90 % del valor nominal configurado.")
            elif voltage > NOMINAL_VOLTAGE * 1.1:
                record_anomaly("voltage", "Sobretensión", voltage, "V", "warning", "Voltaje superior al 110 % del valor nominal configurado.")
            anomaly_power_threshold = float(STATE.get("anomalyPowerThreshold") or DEFAULT_ANOMALY_POWER_THRESHOLD)
            if measured_power >= anomaly_power_threshold:
                severity = "critical" if measured_power >= anomaly_power_threshold * 1.25 else "warning"
                record_anomaly("consumption", "Demanda elevada", measured_power, "W", severity, f"La potencia superó el límite configurado de {anomaly_power_threshold:,.0f} W.".replace(",", "."))
            if now_monotonic - last_record >= 60:
                interval_consumption = measured_power / 1000 * (now_monotonic - last_record) / 3600
                with db_connection() as connection:
                    connection.execute(
                        "INSERT INTO telemetry(timestamp, voltage, current, power, consumption, cost, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (iso_now(), voltage, current, measured_power, interval_consumption, interval_consumption * float(STATE.get("tariff") or TARIFF_CLP), "simulation" if SIMULATION else "live"),
                    )
                last_record = now_monotonic
                save_state()
            await MANAGER.broadcast({"type": "telemetry", "voltage": STATE["voltage"], "current": STATE["current"], "power": STATE["power"], "energy": STATE["energy"], "cost": STATE["cost"], "battery": STATE["battery"], "batteryHealth": STATE["batteryHealth"], "batteryCycles": STATE["batteryCycles"], "batteryTemperature": STATE["batteryTemperature"], "timestamp": iso_now(), "source": "simulation" if SIMULATION else "live"})
            if schedule_changes or shutdown_completed or grants_expired:
                reason = "card_shutdown_complete" if shutdown_completed else "schedule_applied" if schedule_changes else "permission_grant_expired"
                await persist_and_broadcast(reason, "server-scheduler")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_database()
    tasks = [
        asyncio.create_task(system_loop()),
        asyncio.create_task(tariff_update_loop()),
        asyncio.create_task(ARDUINO_BRIDGE.run(handle_arduino_event)),
    ]
    try:
        yield
    finally:
        await ARDUINO_BRIDGE.stop()
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task


app = FastAPI(title="VoltKey Arduino Test", version=f"{ARDUINO_TEST_VERSION} (base {APP_VERSION})", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["GET"], allow_headers=["*"])


@app.get("/")
async def root() -> dict[str, Any]:
    return {"name": "VoltKey Arduino Test", "edition": ARDUINO_TEST_VERSION, "baseVersion": APP_VERSION, "status": "online", "websocket": "/ws"}


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "version": APP_VERSION,
        "edition": EDITION,
        "arduino": ARDUINO_BRIDGE.status(),
        "physicalServerRequired": ARDUINO_REQUIRED,
        "clients": len(MANAGER.clients),
        "time": iso_now(),
        "timezone": TIMEZONE_NAME,
        "timezoneSource": TIMEZONE_STATUS,
        "tariff": STATE.get("tariff", TARIFF_CLP),
        "tariffStatus": (STATE.get("tariffMeta") or {}).get("status", "respaldo"),
        "tariffProvider": "Edelaysen",
        "anomalyPowerThreshold": STATE.get("anomalyPowerThreshold", DEFAULT_ANOMALY_POWER_THRESHOLD),
        "pendingPermissionRequests": sum(1 for request in STATE.get("permissionRequests") or [] if request.get("status") == "pending"),
    }


@app.get("/state")
async def get_state(token: str = Query(default="")) -> dict[str, Any]:
    if not token_is_valid(token):
        raise HTTPException(status_code=401, detail="Token no válido")
    return state_for_client("state", "rest", "http")


@app.get("/history")
async def get_history(period: str = Query(default="1m"), token: str = Query(default="")) -> dict[str, Any]:
    if not token_is_valid(token):
        raise HTTPException(status_code=401, detail="Token no válido")
    return query_history(period)


@app.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(default=""),
    client_id: str = Query(default=""),
    platform: str = Query(default="unknown"),
    name: str = Query(default=""),
) -> None:
    if not token_is_valid(token):
        await websocket.close(code=1008, reason="Token no válido")
        return
    await MANAGER.connect(websocket, client_id, platform, name)
    await MANAGER.send(websocket, state_for_client("state", "connected", "server"))
    await MANAGER.broadcast_presence()
    try:
        while True:
            message = await websocket.receive_json()
            if isinstance(message, dict):
                await handle_message(websocket, message)
    except WebSocketDisconnect:
        pass
    except Exception as error:
        with contextlib.suppress(Exception):
            await MANAGER.send(websocket, {"type": "command_error", "message": str(error)})
    finally:
        MANAGER.disconnect(websocket)
        await MANAGER.broadcast_presence()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("servidor.voltkey_server:app", host="0.0.0.0", port=8000, reload=False)
