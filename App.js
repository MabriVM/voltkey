import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, AppState, Easing, Image, Linking, Modal, Platform,
  Pressable as NativePressable, ScrollView, StatusBar, StyleSheet, Switch as NativeSwitch, Text,
  TextInput, Vibration, View, useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useFonts } from "expo-font";
import { useAudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ANOMALY_METRIC_OPTIONS, ANOMALY_STATUS_OPTIONS, DAY_OPTIONS, METRIC_DEFINITIONS, PERIOD_OPTIONS, TARIFF_CLP,
  anomalyRecordKey, buildDemoHistory, detectAnomalies, filterHistory, getAnomalyGuidance, getMetricAnalysis, getRecommendations,
  isScheduleActive, isValidTime, scheduleDaysLabel,
} from "./src/energy";
import { exportEnergyWorkbook } from "./src/exportExcel";

const APP_VERSION = "1.12.0";
const RELEASE_VERSION = "2.1.0";
const ARDUINO_TEST_VERSION = "1.2";
const EDITION_LABEL = `VOLTKEY ALPHA ARDUINO ${RELEASE_VERSION}`;
const EDITION_ID = `arduino-test-${ARDUINO_TEST_VERSION}`;
const BATTERY_CAPACITY_KWH = 1.5;
const BATTERY_CHARGE_POWER_KW = 0.45;
const DEFAULT_ANOMALY_POWER_THRESHOLD = 3500;
const MIN_ANOMALY_POWER_THRESHOLD = 100;
const MAX_ANOMALY_POWER_THRESHOLD = 50000;
const WS_URL = process.env.EXPO_PUBLIC_WS_URL || "";
const WS_TOKEN = process.env.EXPO_PUBLIC_VOLTKEY_TOKEN || process.env.EXPO_PUBLIC_ALPHA_TOKEN || "";
const CLIENT_ID = `voltkey-${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const UiFeedbackContext = React.createContext(() => {});
let globalUiFeedback = () => {};

function Pressable({ onPress, feedback = "tap", silent = false, ...props }) {
  const playFeedback = React.useContext(UiFeedbackContext);
  return <NativePressable {...props} onPress={onPress ? (event) => {
    if (!silent) playFeedback(feedback);
    onPress(event);
  } : undefined} />;
}

function Switch({ value, onValueChange, ...props }) {
  const playFeedback = React.useContext(UiFeedbackContext);
  return <NativeSwitch {...props} value={value} onValueChange={onValueChange ? (nextValue) => {
    playFeedback(nextValue ? "on" : "off");
    onValueChange(nextValue);
  } : undefined} />;
}
const DEFAULT_TARIFF_META = {
  provider: "Edelaysen", plan: "BT1 residencial", status: "respaldo",
  effectiveFrom: "2026-08-01", lastCheckedAt: null,
  sourceUrl: "https://www.gruposaesa.cl/edelaysen/tarifas-vigentes",
};

const PALETTES = {
  starter: {
    id: "starter", name: "Inicio fácil", description: "Clara, serena y recomendada para usuarios nuevos",
    isLight: true,
    bg: "#F3F6FA", surface: "#FFFFFF", surfaceRaised: "#EAF0F7", border: "#D6DFEA",
    accent: "#007DBD", accentBright: "#005A9C", accentDim: "#DDF5FF",
    text: "#10233D", muted: "#5B6F86", success: "#4F9700", warning: "#A85B08", danger: "#C43D50",
    onAccent: "#FFFFFF", shadow: "#52647A",
  },
  alpha: {
    id: "alpha", name: "VoltKey Pulse", description: "Tecnológica y energética",
    recommended: true, isLight: false,
    bg: "#020918", surface: "#061A36", surfaceRaised: "#0A2850", border: "#19446D",
    accent: "#00BDF2", accentBright: "#78E600", accentDim: "#073A55",
    text: "#F5FBFF", muted: "#8EA9C1", success: "#78E600", warning: "#FFB020", danger: "#FF5263",
    onAccent: "#FFFFFF", shadow: "#000000",
  },
  ocean: {
    id: "ocean", name: "Ocean Pulse", description: "Azul eléctrico y profundo",
    isLight: false,
    bg: "#04090D", surface: "#0B141B", surfaceRaised: "#111F29", border: "#243743",
    accent: "#00AEEB", accentBright: "#38CCFF", accentDim: "#073446",
    text: "#F1FAFF", muted: "#87A2B1", success: "#24D6A1", warning: "#FFC857", danger: "#FF6678",
    onAccent: "#031219", shadow: "#000000",
  },
  emerald: {
    id: "emerald", name: "Eco Grid", description: "Eficiencia y hogar inteligente",
    isLight: false,
    bg: "#040A08", surface: "#0C1713", surfaceRaised: "#12221C", border: "#294137",
    accent: "#20C77A", accentBright: "#56E49F", accentDim: "#0A3825",
    text: "#F2FFF8", muted: "#8EAA9D", success: "#54E391", warning: "#FFC857", danger: "#FF6678",
    onAccent: "#03140C", shadow: "#000000",
  },
  amber: {
    id: "amber", name: "Industrial Amber", description: "Panel eléctrico industrial",
    isLight: false,
    bg: "#090806", surface: "#17140E", surfaceRaised: "#211C13", border: "#403721",
    accent: "#F2A900", accentBright: "#FFC83D", accentDim: "#3C2B08",
    text: "#FFF9E9", muted: "#AAA08A", success: "#64D98B", warning: "#FFC83D", danger: "#FF6464",
    onAccent: "#171006", shadow: "#000000",
  },
};

const KIDS_PALETTES = {
  light: {
    id: "light", name: "Claro · Inicio Fácil", description: "Claro, sereno y fácil de leer",
    isLight: true,
    bg: "#F3F6FA", surface: "#FFFFFF", surfaceRaised: "#EAF0F7", border: "#D6DFEA",
    accent: "#007DBD", accentBright: "#005A9C", accentDim: "#DDF5FF",
    text: "#10233D", muted: "#5B6F86", success: "#4F9700", warning: "#A85B08", danger: "#C43D50",
    onAccent: "#FFFFFF", shadow: "#52647A",
  },
  dark: {
    id: "dark", name: "Oscuro · Pulse", description: "VoltKey Pulse, ahora en VoltKids",
    isLight: false,
    bg: "#020918", surface: "#061A36", surfaceRaised: "#0A2850", border: "#19446D",
    accent: "#00BDF2", accentBright: "#78E600", accentDim: "#073A55",
    text: "#F5FBFF", muted: "#8EA9C1", success: "#78E600", warning: "#FFB020", danger: "#FF5263",
    onAccent: "#FFFFFF", shadow: "#000000",
  },
  hacker: {
    id: "hacker", name: "Hacker", description: "Terminal de agente",
    isLight: false,
    bg: "#030705", surface: "#07110B", surfaceRaised: "#0B1A10", border: "#1D4B2B",
    accent: "#18B957", accentBright: "#64F58F", accentDim: "#0A3619",
    text: "#BDFDCE", muted: "#619A70", success: "#64F58F", warning: "#D3C86A", danger: "#FF6874",
    onAccent: "#021006", shadow: "#000000",
  },
};

const ECO_TIPS = [
  { id: "daylight", icon: "sunny-outline", savingWh: 60, title: "APROVECHA LA LUZ DEL DÍA", text: "Abre cortinas antes de encender una lámpara. La luz natural ayuda a ahorrar energía." },
  { id: "unused", icon: "power-outline", savingWh: 100, title: "APAGA LO QUE NADIE USA", text: "Si una habitación queda vacía, avisa y apaga su luz o equipo desde un control autorizado." },
  { id: "fridge", icon: "snow-outline", savingWh: 20, title: "CIERRA BIEN EL REFRIGERADOR", text: "Piensa qué necesitas antes de abrirlo: dejar la puerta abierta hace que consuma más energía." },
  { id: "reuse", icon: "repeat-outline", savingWh: 0, title: "REUTILIZA ANTES DE BOTAR", text: "Guarda cajas, frascos limpios y hojas por una cara para manualidades o nuevos usos en familia." },
  { id: "recycle", icon: "leaf-outline", savingWh: 0, title: "RECICLA EN FAMILIA", text: "Separa papel, cartón, vidrio, latas y plásticos limpios según los puntos de reciclaje de tu comuna." },
  { id: "chargers", icon: "battery-charging-outline", savingWh: 10, title: "PIDE AYUDA CON LOS CARGADORES", text: "Avísale a un adulto si un cargador ya no se usa. No tires del cable ni manipules enchufes dañados." },
];

const HACKER_LESSONS = [
  { id: "voltage", icon: "pulse-outline", code: "V", title: "VOLTAJE", text: "Es el empuje que mueve la electricidad. En VoltKey puedes observarlo sin tocar la instalación." },
  { id: "current", icon: "git-compare-outline", code: "A", title: "CORRIENTE", text: "Indica cuánto flujo eléctrico circula. Se expresa en amperes y aquí se muestra como una estimación." },
  { id: "power", icon: "flash-outline", code: "P = V × I", title: "POTENCIA", text: "Los watts dicen cuánta potencia usa un equipo en un momento. Más watts suelen significar mayor demanda." },
  { id: "energy", icon: "analytics-outline", code: "kWh", title: "ENERGÍA", text: "Mide lo consumido durante un tiempo. No es lo mismo que W: una es acumulada y la otra instantánea." },
  { id: "resistance", icon: "git-network-outline", code: "R = V ÷ I", title: "RESISTENCIA", text: "La resistencia se opone al paso de corriente y se mide en ohmios. Nunca se mide una instalación energizada sin formación e instrumentos adecuados." },
  { id: "alternating", icon: "swap-vertical-outline", code: "50 Hz", title: "CORRIENTE ALTERNA", text: "En una vivienda chilena la tensión cambia de sentido 50 veces por segundo. Esa frecuencia se expresa en hertz." },
  { id: "protection", icon: "shield-checkmark-outline", code: "MCB / RCD", title: "PROTECCIONES", text: "El automático protege conductores ante sobrecorriente y el diferencial ayuda frente a fugas. Solo un adulto autorizado debe manipular el tablero." },
  { id: "cost", icon: "cash-outline", code: "CLP = kWh × tarifa", title: "COSTO", text: "El costo aproximado depende de la energía utilizada y de la tarifa. Reducir horas de uso puede ayudar a toda la familia." },
];

const ECO_BADGES = [
  { id: "starter", min: 1, icon: "leaf-outline", label: "ECO EXPLORADOR" },
  { id: "helper", min: 3, icon: "people-outline", label: "AYUDANTE DEL HOGAR" },
  { id: "guardian", min: 6, icon: "earth-outline", label: "GUARDIÁN DEL PLANETA" },
];

const PERMISSION_GRANT_OPTIONS = [
  { id: "once", label: "UNA VEZ", icon: "finger-print-outline", description: "Se consume al cambiar el circuito una vez." },
  { id: "hour", label: "1 HORA", icon: "time-outline", description: "Permite control temporal durante 60 minutos." },
  { id: "permanent", label: "SIEMPRE", icon: "shield-checkmark-outline", description: "Se añade a los permisos habituales del perfil." },
];

const TUTORIAL_STEPS = [
  { icon: "key-outline", title: "¿POR QUÉ EXISTE VOLTKEY?", text: "Para reunir control, ahorro, seguridad y aprendizaje eléctrico en una sola interfaz, mostrando siempre qué orden pidió la aplicación y qué confirmó el Arduino." },
  { icon: "hardware-chip-outline", title: "DEL CELULAR AL PROTOTIPO", text: "La aplicación envía la orden al computador, la pasarela USB la entrega al Arduino y el UNO activa el relé y su LED del shield." },
  { icon: "options-outline", title: "TRES CIRCUITOS REALES", text: "General alimenta al 1.er y 2.º piso. Los dos pisos solo pueden encenderse cuando General está activo y el Arduino confirma la salida." },
  { icon: "card-outline", title: "TARJETA E INDICADOR", text: "A0 representa el contacto de tarjeta. El LED queda fijo con tarjeta y red, parpadea durante un corte o la cuenta regresiva y se apaga al terminar el retiro." },
  { icon: "happy-outline", title: "PERFILES PROTEGIDOS", text: "VoltKids utiliza solo controles autorizados. Ajustes y Tutorial permanecen abiertos hasta que la persona decide cambiar de página o perfil." },
  { icon: "school-outline", title: "TUTORIAL SIEMPRE DISPONIBLE", text: "La sexta pestaña explica el sistema a personas nuevas. Puedes ocultarla en Ajustes y recuperar las cinco pestañas habituales." },
];

const CARD_LED_BLINK_OPTIONS = [250, 500, 1000, 2000];
const DEFAULT_CARD_LED_CONFIG = { pin: 13, activeLow: false, outageBlinkMs: 1000, output: true, mode: "steady" };

function cardLedModeText(mode, outageBlinkMs = 1000) {
  if (mode === "steady") return "LED FIJO ENCENDIDO";
  if (mode === "outage_blink") return `CORTE · PARPADEO CADA ${Number(outageBlinkMs) / 1000} s`;
  if (mode === "countdown_blink") return "CUENTA REGRESIVA · PARPADEO CADA 1 s";
  return "LED APAGADO";
}

const TECHNICAL_PALETTE = {
  id: "voltkey-tec", name: "VoltKey Tec", description: "Entorno técnico de alta atención",
  isLight: false,
  bg: "#050506", surface: "#111114", surfaceRaised: "#1B1114", border: "#42242A",
  accent: "#E3132B", accentBright: "#FF4356", accentDim: "#3B0D16",
  text: "#FFF7F8", muted: "#B9A0A5", success: "#52D689", warning: "#FFB020", danger: "#FF4356",
  onAccent: "#FFFFFF", shadow: "#000000",
};

const FONT_PRESETS = {
  techno: {
    id: "techno", name: "Techno", sample: "VOLTKEY 220V",
    title: "Orbitron_700Bold", heading: "Orbitron_600SemiBold", body: "Rajdhani_500Medium",
    bold: "Rajdhani_700Bold", mono: "SpaceMono_700Bold",
  },
  modern: {
    id: "modern", name: "Moderna", sample: "VoltKey 220 V",
    title: "Inter_700Bold", heading: "Inter_600SemiBold", body: "Inter_400Regular",
    bold: "Inter_700Bold", mono: "SpaceMono_700Bold",
  },
  industrial: {
    id: "industrial", name: "Industrial", sample: "VOLTKEY / 220 V",
    title: "Rajdhani_700Bold", heading: "Rajdhani_700Bold", body: "Rajdhani_500Medium",
    bold: "Rajdhani_700Bold", mono: "SpaceMono_700Bold",
  },
  terminal: {
    id: "terminal", name: "Terminal", sample: "> VOLTKEY_220V",
    title: "SpaceMono_700Bold", heading: "SpaceMono_700Bold", body: "SpaceMono_400Regular",
    bold: "SpaceMono_700Bold", mono: "SpaceMono_700Bold",
  },
};

const INITIAL_CIRCUITS = [
  { id: 1, name: "GENERAL", room: "Tablero prototipo", icon: "flash-outline", power: 0, anomalyThreshold: 3500, on: true, essential: true, adminLocked: false },
  { id: 2, name: "1ER PISO", room: "Primer piso", icon: "home-outline", power: 500, anomalyThreshold: 1000, on: false, essential: false, adminLocked: false },
  { id: 3, name: "2DO PISO", room: "Segundo piso", icon: "business-outline", power: 500, anomalyThreshold: 1000, on: false, essential: false, adminLocked: false },
];

const CIRCUIT_CATEGORIES = [
  { id: "general", label: "General", icon: "flash-outline" },
  { id: "iluminacion", label: "Iluminación", icon: "bulb-outline" },
  { id: "enchufe", label: "Enchufe", icon: "power-outline" },
  { id: "frio", label: "Refrigeración", icon: "snow-outline" },
  { id: "clima", label: "Climatización", icon: "thermometer-outline" },
  { id: "motor", label: "Motor / bomba", icon: "water-outline" },
  { id: "cocina", label: "Cocina", icon: "restaurant-outline" },
  { id: "seguridad", label: "Seguridad", icon: "shield-outline" },
];

const SOURCE_OPTIONS = [
  { id: "text", label: "Texto", icon: "document-text-outline", help: "Copia los datos de la placa o ficha." },
  { id: "photo", label: "Foto", icon: "camera-outline", help: "Adjunta una placa, equipo o documento." },
  { id: "link", label: "Ficha web", icon: "link-outline", help: "Guarda el enlace del fabricante o PDF." },
];

const EMPTY_CIRCUIT_FORM = {
  name: "", room: "", category: "general", brand: "", model: "", power: "", voltage: "220",
  current: "", breaker: "", essential: false, sourceType: "text", sourceText: "",
  anomalyThreshold: "", photoUri: "", datasheetUrl: "", notes: "",
};

const DEFAULT_PROFILES = [
  {
    id: "family-admin", name: "Familia", role: "normal", icon: "people-outline",
    pinHash: "", allowedCircuitIds: [], createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z",
  },
  {
    id: "family-children", name: "Niños", role: "child", icon: "happy-outline",
    pinHash: "", allowedCircuitIds: [2, 3], createdAt: "2026-08-22T00:00:00.000Z", updatedAt: "2026-08-22T00:00:00.000Z",
  },
];

const EMPTY_PROFILE_FORM = { name: "", role: "child", icon: "happy-outline", pin: "", allowedCircuitIds: [] };

const PROFILE_ICONS = [
  "person-outline", "people-outline", "happy-outline", "home-outline", "school-outline", "game-controller-outline",
];

function toNumber(value) {
  const parsed = Number(String(value ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLineValue(text, labels) {
  const escaped = labels.join("|");
  return text.match(new RegExp(`(?:^|\\n)\\s*(?:${escaped})\\s*[:=-]\\s*([^\\n]+)`, "i"))?.[1]?.trim() || "";
}

function getUnitValue(text, units) {
  const match = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:${units})(?:\\b|$)`, "i"));
  return match ? match[1].replace(",", ".") : "";
}

function parseTechnicalText(text) {
  return {
    name: getLineValue(text, ["nombre", "equipo", "circuito"]),
    brand: getLineValue(text, ["marca", "fabricante"]),
    model: getLineValue(text, ["modelo", "model"]),
    power: getUnitValue(text, "w|watt|watts"),
    voltage: getUnitValue(text, "v|volt|volts|voltios"),
    current: getUnitValue(text, "a|amp|amps|amperios"),
    breaker: getLineValue(text, ["protecci[oó]n", "autom[aá]tico", "breaker"])
      .match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(",", ".") || "",
  };
}

function isWebUrl(value) {
  return /^https?:\/\/[^\s]+$/i.test(String(value || "").trim());
}

function pinHash(pin, profileId) {
  let hash = 2166136261;
  const value = `${profileId}:${String(pin || "")}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `vk1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeProfiles(value) {
  if (!Array.isArray(value)) return DEFAULT_PROFILES.map((profile) => ({ ...profile, allowedCircuitIds: [...profile.allowedCircuitIds] }));
  const seen = new Set();
  const profiles = value.slice(0, 12).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const id = String(raw.id || "").trim();
    const name = String(raw.name || "").trim().slice(0, 32);
    if (!id || !name || seen.has(id)) return [];
    seen.add(id);
    const role = raw.role === "child" ? "child" : "normal";
    return [{
      id, name, role,
      icon: PROFILE_ICONS.includes(raw.icon) ? raw.icon : role === "child" ? "happy-outline" : "person-outline",
      pinHash: role === "normal" ? String(raw.pinHash || "").slice(0, 80) : "",
      allowedCircuitIds: role === "child" && Array.isArray(raw.allowedCircuitIds) ? [...new Set(raw.allowedCircuitIds)].slice(0, 80) : [],
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString(),
    }];
  });
  if (!profiles.some((profile) => profile.role === "normal")) return DEFAULT_PROFILES.map((profile) => ({ ...profile, allowedCircuitIds: [...profile.allowedCircuitIds] }));
  return profiles;
}

function normalizeCircuitControl(circuit) {
  if (!circuit || typeof circuit !== "object") return circuit;
  const power = Math.max(0, toNumber(circuit.power));
  const configuredThreshold = toNumber(circuit.anomalyThreshold);
  return {
    ...circuit,
    room: String(circuit.room || "Sin habitación").trim().slice(0, 40) || "Sin habitación",
    power,
    anomalyThreshold: configuredThreshold > 0 ? configuredThreshold : Math.max(100, Math.round(power * 1.5)),
    adminLocked: Boolean(circuit.adminLocked),
    adminDecisionAt: circuit.adminDecisionAt ? String(circuit.adminDecisionAt) : null,
    adminProfileId: circuit.adminProfileId ? String(circuit.adminProfileId) : null,
    controlUpdatedAt: circuit.controlUpdatedAt ? String(circuit.controlUpdatedAt) : null,
    lastControlCommandId: circuit.lastControlCommandId ? String(circuit.lastControlCommandId) : null,
  };
}

function normalizeArduinoTestCircuits(value) {
  const incoming = Array.isArray(value) ? value : [];
  return INITIAL_CIRCUITS.map((base) => normalizeCircuitControl({
    ...base,
    ...(incoming.find((circuit) => String(circuit?.id) === String(base.id)) || {}),
    id: base.id,
  }));
}

function normalizeAnomalyReviews(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(-500).flatMap(([key, raw]) => {
    if (!key || !raw || typeof raw !== "object") return [];
    const status = ["open", "reviewed", "resolved"].includes(raw.status) ? raw.status : "open";
    return [[String(key).slice(0, 300), {
      status,
      note: String(raw.note || "").slice(0, 500),
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
      reviewedBy: raw.reviewedBy ? String(raw.reviewedBy).slice(0, 80) : null,
    }]];
  }));
}

function normalizePermissionRequests(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(-200).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const id = String(raw.id || "").trim().slice(0, 96);
    const profileId = String(raw.profileId || "").trim().slice(0, 80);
    const circuitId = raw.circuitId;
    if (!id || !profileId || circuitId === undefined || circuitId === null || seen.has(id)) return [];
    seen.add(id);
    const status = ["pending", "approved", "denied", "cancelled", "used", "expired"].includes(raw.status) ? raw.status : "pending";
    const grantScope = ["once", "hour", "permanent"].includes(raw.grantScope) ? raw.grantScope : null;
    return [{
      id,
      profileId,
      profileName: String(raw.profileName || "VoltKids").trim().slice(0, 32) || "VoltKids",
      circuitId,
      circuitName: String(raw.circuitName || "Circuito").trim().slice(0, 80) || "Circuito",
      status,
      createdAt: raw.createdAt ? String(raw.createdAt) : new Date().toISOString(),
      resolvedAt: raw.resolvedAt ? String(raw.resolvedAt) : null,
      resolvedBy: raw.resolvedBy ? String(raw.resolvedBy).slice(0, 80) : null,
      grantScope,
      expiresAt: raw.expiresAt ? String(raw.expiresAt) : null,
      remainingUses: grantScope === "once" ? Math.max(0, Math.min(1, Number(raw.remainingUses ?? 1))) : null,
    }];
  });
}

function normalizeActivityLog(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(-500).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const id = String(raw.id || "").trim().slice(0, 120);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      timestamp: raw.timestamp ? String(raw.timestamp) : new Date().toISOString(),
      category: String(raw.category || "system").slice(0, 32),
      action: String(raw.action || "Actividad").slice(0, 100),
      detail: String(raw.detail || "").slice(0, 300),
      outcome: ["applied", "pending", "blocked", "failed"].includes(raw.outcome) ? raw.outcome : "applied",
      circuitId: raw.circuitId ?? null,
      circuitName: raw.circuitName ? String(raw.circuitName).slice(0, 80) : null,
      profileId: raw.profileId ? String(raw.profileId).slice(0, 80) : null,
      profileName: raw.profileName ? String(raw.profileName).slice(0, 32) : "Sistema",
      profileRole: raw.profileRole === "child" ? "child" : "normal",
      device: String(raw.device || "Dispositivo").slice(0, 40),
    }];
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function normalizeArchivedCircuits(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(-100).flatMap((raw) => {
    const circuit = normalizeCircuitControl(raw);
    const key = String(circuit?.id ?? "");
    if (!circuit || !key || seen.has(key)) return [];
    seen.add(key);
    return [{ ...circuit, on: false, adminLocked: false, archivedAt: circuit.archivedAt || new Date().toISOString() }];
  });
}

function normalizeKidsMissions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).slice(-100).flatMap(([key, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    return [[String(key).slice(0, 180), {
      profileId: String(raw.profileId || "").slice(0, 80),
      tipId: String(raw.tipId || "").slice(0, 80),
      completedAt: raw.completedAt ? String(raw.completedAt) : new Date().toISOString(),
      estimatedWh: Math.max(0, Math.min(5000, Number(raw.estimatedWh || 0))),
    }]];
  }));
}

function permissionGrantIsActive(request, profileId, circuitId, now = Date.now()) {
  if (!request || request.status !== "approved" || String(request.profileId) !== String(profileId) || String(request.circuitId) !== String(circuitId)) return false;
  if (request.grantScope === "once") return Number(request.remainingUses ?? 1) > 0;
  if (request.grantScope === "hour") return Boolean(request.expiresAt && new Date(request.expiresAt).getTime() > now);
  return request.grantScope === "permanent";
}

function sourceLabel(sourceType) {
  if (sourceType === "photo") return "FOTO";
  if (sourceType === "link") return "FICHA WEB";
  if (sourceType === "text") return "REGISTRO";
  return "BASE";
}

function notifyUser(title, message) {
  globalUiFeedback("alert");
  if (Platform.OS === "web") globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function confirmUser(title, message, onConfirm) {
  const confirmWithFeedback = () => {
    globalUiFeedback("delete");
    onConfirm();
  };
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) confirmWithFeedback();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: "Eliminar", style: "destructive", onPress: confirmWithFeedback },
  ]);
}

function confirmChoice(title, message, confirmLabel, onConfirm) {
  const confirmWithFeedback = () => {
    globalUiFeedback("transition");
    onConfirm();
  };
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) confirmWithFeedback();
    return;
  }
  Alert.alert(title, message, [
    { text: "Cancelar", style: "cancel" },
    { text: confirmLabel, onPress: confirmWithFeedback },
  ]);
}

function removeStoredPhoto(uri) {
  const appPhotoDirectories = FileSystem.documentDirectory
    ? [`${FileSystem.documentDirectory}voltkey-circuit-photos/`, `${FileSystem.documentDirectory}alpha-circuit-photos/`]
    : [];
  if (Platform.OS !== "web" && appPhotoDirectories.some((directory) => uri?.startsWith(directory))) {
    FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

function websocketUrl() {
  if (!WS_URL) return "";
  const separator = WS_URL.includes("?") ? "&" : "?";
  const params = [
    `client_id=${encodeURIComponent(CLIENT_ID)}`,
    `platform=${encodeURIComponent(Platform.OS)}`,
    `name=${encodeURIComponent(Platform.OS === "web" ? "Computador" : "Celular")}`,
  ];
  if (WS_TOKEN) params.push(`token=${encodeURIComponent(WS_TOKEN)}`);
  return `${WS_URL}${separator}${params.join("&")}`;
}

function dateTimeLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin registro" : date.toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
}

function dateLabel(value) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? new Date(`${value}T12:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin vigencia informada" : date.toLocaleDateString("es-CL", { dateStyle: "long" });
}

function tariffLabel(value) {
  return Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: Number(value) % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

function tariffStatusLabel(status) {
  if (status === "vigente") return "ACTUALIZADO";
  if (status === "revisando") return "REVISANDO";
  if (status === "error") return "ÚLTIMA TARIFA VÁLIDA";
  return "RESPALDO $280";
}

function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours <= 0) return "Sin carga activa";
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!wholeHours) return `${minutes} min`;
  return minutes ? `${wholeHours} h ${minutes} min` : `${wholeHours} h`;
}

function formatElapsedDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(totalSeconds % 3600 / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function defaultSchedule(circuits) {
  return {
    id: null,
    circuitId: circuits[0]?.id ?? null,
    start: "08:00",
    end: "18:00",
    days: [1, 2, 3, 4, 5],
    enabled: true,
  };
}

const NAV_ITEMS = [
  { id: "inicio", label: "Inicio", icon: "home-outline", activeIcon: "home" },
  { id: "circuitos", label: "Circuito", icon: "options-outline", activeIcon: "options" },
  { id: "energia", label: "Energía", icon: "analytics-outline", activeIcon: "analytics" },
  { id: "respaldo", label: "Respaldo", icon: "battery-half-outline", activeIcon: "battery-half" },
  { id: "ajustes", label: "Ajustes", icon: "settings-outline", activeIcon: "settings" },
];

const TUTORIAL_NAV_ITEM = { id: "tutorial", label: "Tutorial", icon: "school-outline", activeIcon: "school" };

const CHILD_NAV_ITEMS = [
  { id: "inicio", label: "Inicio", icon: "home-outline", activeIcon: "home" },
  { id: "circuitos", label: "Habitaciones", icon: "bed-outline", activeIcon: "bed" },
  { id: "ajustes", label: "Ajustes", icon: "settings-outline", activeIcon: "settings" },
];

const USER_MODES = [
  { id: "home", label: "VoltKey", icon: "home-outline", description: "Controles simples, avisos claros y funciones cotidianas." },
  { id: "technical", label: "VoltKey Tec", icon: "construct-outline", description: "Diagnóstico, mantenimiento y parámetros eléctricos avanzados." },
];

const CIRCUIT_VIEW_MODES = [
  { id: "large", label: "Botones", icon: "grid-outline", description: "Botones grandes para control rápido de cada circuito." },
  { id: "detail", label: "Lista", icon: "list-outline", description: "Lista técnica con estado, prioridad, edición y diagnóstico." },
];


const INFORMATION_PRESETS = [
  { id: "1", label: "1 · COMPLETO", icon: "layers-outline", description: "Toda la información, métricas, análisis, diagnósticos y módulos disponibles." },
  { id: "2", label: "2 · ESENCIAL", icon: "reader-outline", description: "Muestra los datos más relevantes y reduce el detalle técnico en pantalla." },
  { id: "3", label: "3 · MÍNIMO", icon: "toggle-outline", description: "Conserva controles, estados y avisos necesarios con la menor cantidad de información." },
];

const INFORMATION_CATEGORIES = [
  { id: "inicio", label: "Inicio", icon: "home-outline" },
  { id: "circuitos", label: "Circuitos", icon: "options-outline" },
  { id: "energia", label: "Energía", icon: "analytics-outline" },
  { id: "respaldo", label: "Respaldo", icon: "battery-half-outline" },
  { id: "sistema", label: "Sistema", icon: "settings-outline" },
];

const INFORMATION_MODULES = [
  { id: "home.metrics", category: "inicio", detail: 2, label: "Métricas eléctricas", description: "Voltaje, corriente, consumo y costo estimado." },
  { id: "home.status", category: "inicio", detail: 3, label: "Estado del hogar", description: "Tarjeta, alimentación y cantidad de circuitos esenciales." },
  { id: "kids.themes", category: "inicio", detail: 2, child: true, label: "Selector de tema VoltKids", description: "Temas Claro, Oscuro y Hacker." },
  { id: "kids.learning", category: "inicio", detail: 1, child: true, label: "Aprendizaje VoltKids", description: "Academia eléctrica, terminal y misiones ecológicas." },
  { id: "circuits.search", category: "circuitos", detail: 2, label: "Búsqueda y filtros", description: "Buscar por nombre, equipo o habitación." },
  { id: "circuits.hardware", category: "circuitos", detail: 1, label: "Módulos Arduino", description: "Relés, pines, polaridad, LED y pruebas físicas." },
  { id: "energy.summary", category: "energia", detail: 1, label: "Resumen de energía", description: "Periodo, métricas de consumo y costo." },
  { id: "energy.analysis", category: "energia", detail: 1, label: "Análisis avanzado", description: "Gráficos, Excel, cargas, recomendaciones y temporizadores." },
  { id: "backup.summary", category: "respaldo", detail: 2, label: "Resumen de respaldo", description: "Autonomía, carga esencial y tiempo de recarga." },
  { id: "backup.health", category: "respaldo", detail: 1, label: "Salud de baterías", description: "Capacidad efectiva, ciclos y temperatura." },
  { id: "system.tariff", category: "sistema", detail: 1, label: "Tarifario y costos", description: "Precio de referencia y vigencia del tarifario." },
  { id: "system.hardware", category: "sistema", detail: 1, label: "Diagnóstico Arduino", description: "Servidor USB, firmware compatible, prueba guiada y conexión." },
];

const ADMIN_INTRO_MISSIONS = [
  { id: "admin-3-home", stage: 3, icon: "home-outline", title: "CONOCER INICIO", text: "Reconoce la potencia instantánea, el estado de la vivienda y los avisos principales.", target: "inicio", achievement: "Primer vistazo" },
  { id: "admin-3-circuits", stage: 3, icon: "power-outline", title: "RECONOCER CIRCUITOS", text: "Aprende dónde encender o apagar General, 1.er piso y 2.do piso.", target: "circuitos", achievement: "Control básico" },
  { id: "admin-3-settings", stage: 3, icon: "settings-outline", title: "CONOCER AJUSTES", text: "Ubica Tutorial, perfiles, vista Botones/Lista y preferencias de información.", target: "ajustes", achievement: "Configurador" },
  { id: "admin-2-metrics", stage: 2, icon: "speedometer-outline", title: "LEER LOS DATOS BÁSICOS", text: "Distingue voltaje, corriente, consumo y costo sin entrar todavía al análisis avanzado.", target: "inicio", achievement: "Lector de energía" },
  { id: "admin-2-backup", stage: 2, icon: "battery-half-outline", title: "CONOCER RESPALDO", text: "Revisa autonomía, cargas esenciales y qué ocurre durante un corte de energía.", target: "respaldo", achievement: "Respaldo listo" },
  { id: "admin-2-search", stage: 2, icon: "search-outline", title: "ENCONTRAR UN CIRCUITO", text: "Usa búsqueda y filtros para reconocer rápidamente una zona de la vivienda.", target: "circuitos", achievement: "Navegación rápida" },
  { id: "admin-1-energy", stage: 1, icon: "analytics-outline", title: "EXPLORAR ENERGÍA", text: "Conoce historial, consumo, costos, gráficos y recomendaciones.", target: "energia", achievement: "Analista doméstico" },
  { id: "admin-1-anomalies", stage: 1, icon: "warning-outline", title: "REVISAR ANOMALÍAS", text: "Aprende dónde revisar eventos, causas, notas y estados de seguimiento.", target: "anomalies", achievement: "Supervisor" },
  { id: "admin-1-personalize", stage: 1, icon: "options-outline", title: "PERSONALIZAR LA INFORMACIÓN", text: "Prueba los perfiles 1, 2 y 3 y personaliza qué bloques verá este usuario.", target: "ajustes", achievement: "VoltKey a tu medida" },
];

const CHILD_INTRO_MISSIONS = [
  { id: "child-3-home", stage: 3, icon: "happy-outline", title: "CONOCER MI INICIO", text: "Reconoce el estado de la casa y los controles que tu familia dejó disponibles.", target: "inicio", achievement: "Explorador VoltKids" },
  { id: "child-3-circuits", stage: 3, icon: "bed-outline", title: "RECONOCER MIS HABITACIONES", text: "Aprende a encender y apagar únicamente los circuitos autorizados.", target: "circuitos", achievement: "Control seguro" },
  { id: "child-3-settings", stage: 3, icon: "settings-outline", title: "CONOCER MIS AJUSTES", text: "Ubica sonido, vibración, Tutorial y la forma segura de volver a un administrador.", target: "ajustes", achievement: "Orientación" },
  { id: "child-2-permissions", stage: 2, icon: "key-outline", title: "ENTENDER LOS PERMISOS", text: "Reconoce qué significa un circuito bloqueado y cuándo debes pedir ayuda a un administrador.", target: "circuitos", achievement: "Permisos claros" },
  { id: "child-2-themes", stage: 2, icon: "color-palette-outline", title: "ELEGIR MI INTERFAZ", text: "Conoce los temas VoltKids y cómo una vista puede mostrar más o menos información.", target: "inicio", achievement: "Mi interfaz" },
  { id: "child-2-tutorial", stage: 2, icon: "school-outline", title: "VOLVER AL TUTORIAL", text: "Aprende a regresar a estas misiones cuando necesites recordar una función.", target: "tutorial", achievement: "Ruta encontrada" },
  { id: "child-1-eco", stage: 1, icon: "leaf-outline", title: "DESCUBRIR MISIONES ECO", text: "Conoce las acciones educativas de ahorro y cuidado del hogar.", target: "inicio", achievement: "Eco explorador" },
  { id: "child-1-hacker", stage: 1, icon: "terminal-outline", title: "CONOCER MODO HACKER", text: "Descubre la academia eléctrica y sus datos educativos sin perder las protecciones del perfil.", target: "inicio", achievement: "Aprendiz técnico" },
  { id: "child-1-safety", stage: 1, icon: "shield-checkmark-outline", title: "RECORDAR LA SEGURIDAD", text: "Identifica qué cosas puede controlar VoltKids y cuáles siempre requieren a una persona adulta capacitada.", target: "tutorial", achievement: "Uso responsable" },
];

const TECH_INTRO_MISSIONS = [
  { id: "tec-center", icon: "construct-outline", title: "CONOCER EL CENTRO TÉCNICO", text: "Identifica estado de sesión, accesos rápidos y trazabilidad del sistema.", target: "inicio", achievement: "Ingreso técnico" },
  { id: "tec-hardware", icon: "hardware-chip-outline", title: "REVISAR HARDWARE", text: "Comprueba relés, pines, LED de tarjeta y confirmaciones físicas del Arduino.", target: "circuitos", achievement: "Hardware verificado" },
  { id: "tec-anomalies", icon: "warning-outline", title: "DIAGNOSTICAR ANOMALÍAS", text: "Abre el centro de anomalías y reconoce severidad, seguimiento y notas.", target: "anomalies", achievement: "Diagnóstico" },
  { id: "tec-maintenance", icon: "checkbox-outline", title: "REGISTRAR MANTENIMIENTO", text: "Revisa la lista preventiva y entiende qué verificaciones quedan pendientes.", target: "inicio", achievement: "Mantenimiento" },
  { id: "tec-safety", icon: "shield-checkmark-outline", title: "DOMINAR LAS 5 REGLAS DE ORO", text: "Repasa las reglas de seguridad antes de cualquier intervención eléctrica real.", target: "inicio", achievement: "Seguridad técnica" },
];

function informationModulesForPreset(preset) {
  const level = ["1", "2", "3"].includes(String(preset)) ? Number(preset) : 1;
  return Object.fromEntries(INFORMATION_MODULES.map((module) => [module.id, level <= module.detail]));
}

function normalizeInformationProfiles(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([profileId, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    const preset = ["1", "2", "3", "custom"].includes(String(raw.preset)) ? String(raw.preset) : "3";
    const modules = raw.modules && typeof raw.modules === "object" && !Array.isArray(raw.modules)
      ? Object.fromEntries(INFORMATION_MODULES.map((module) => [module.id, typeof raw.modules[module.id] === "boolean" ? raw.modules[module.id] : (preset === "custom" ? true : informationModulesForPreset(preset)[module.id])]))
      : informationModulesForPreset(preset === "custom" ? "1" : preset);
    return [[String(profileId), { preset, modules, updatedAt: raw.updatedAt || null }]];
  }));
}

function normalizeIntroProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([profileId, raw]) => {
    if (!raw || typeof raw !== "object") return [];
    return [[String(profileId), {
      completed: Array.isArray(raw.completed) ? [...new Set(raw.completed.map(String))].slice(0, 80) : [],
      techCompleted: Array.isArray(raw.techCompleted) ? [...new Set(raw.techCompleted.map(String))].slice(0, 40) : [],
      skipped: Boolean(raw.skipped),
      updatedAt: raw.updatedAt || null,
    }]];
  }));
}

const ELECTRICAL_GOLDEN_RULES = [
  { id: 1, title: "CORTE VISIBLE", text: "Abrir todas las fuentes de tensión antes de intervenir." },
  { id: 2, title: "BLOQUEAR", text: "Enclavar, bloquear o retirar fusibles para impedir una realimentación." },
  { id: 3, title: "VERIFICAR", text: "Comprobar la ausencia de tensión con un instrumento adecuado." },
  { id: 4, title: "PUESTA A TIERRA", text: "Poner a tierra y en cortocircuito las posibles fuentes cuando corresponda al procedimiento." },
  { id: 5, title: "DELIMITAR", text: "Señalizar y delimitar la zona de trabajo antes de comenzar." },
];

const LAYOUT_MODES = [
  { id: "auto", label: "Automática", icon: "resize-outline", description: "VoltKey elige según la pantalla." },
  { id: "mobile", label: "Celular", icon: "phone-portrait-outline", description: "Botonera inferior y áreas seguras." },
  { id: "desktop", label: "Computador", icon: "desktop-outline", description: "Menú lateral y panel amplio." },
];

const MAINTENANCE_TASKS = [
  { id: "panel", title: "Tablero y protecciones", interval: "Mensual", text: "Inspección visual de temperatura, olor, ruido y daños. No retirar cubiertas energizadas." },
  { id: "backup", title: "Respaldo de cargas esenciales", interval: "Mensual", text: "Comprobar transferencia, estado de batería y continuidad del router y cerradura." },
  { id: "meter", title: "Contraste del medidor", interval: "Trimestral", text: "Comparar voltaje y corriente con instrumentos adecuados y registrar diferencias." },
  { id: "network", title: "Red y sincronización", interval: "Mensual", text: "Revisar servidor, túnel, latencia y reconexión de celular y computador." },
  { id: "protection", title: "Prueba de protecciones", interval: "Según fabricante", text: "Ejecutar las pruebas indicadas por el fabricante con personal autorizado." },
];

const SERVER_REASON_LABELS = {
  set_circuit: "Circuito actualizado desde otro dispositivo",
  set_essential: "Prioridad de circuito sincronizada",
  card_removed: "Tarjeta retirada desde otro dispositivo",
  card_inserted: "Tarjeta insertada desde otro dispositivo",
  card_shutdown_complete: "Cargas no esenciales desconectadas",
  set_grid: "Estado de la red sincronizado",
  set_schedule: "Temporizador sincronizado",
  delete_schedule: "Temporizador eliminado",
  schedule_applied: "Temporizador aplicado por el servidor",
  add_circuit: "Nuevo circuito sincronizado",
  update_circuit: "Datos del circuito sincronizados",
  delete_circuit: "Circuito eliminado desde otro dispositivo",
  telemetry_input: "Lectura recibida desde el medidor",
  tariff_checked: "Tarifario Edelaysen revisado",
  tariff_updated: "Nuevo precio del kWh sincronizado",
  set_profiles: "Perfiles familiares sincronizados",
  profiles_merged: "Perfiles familiares recuperados y sincronizados",
  set_anomaly_review: "Seguimiento de anomalía sincronizado",
  anomaly_reviews_merged: "Seguimiento de anomalías recuperado",
  set_anomaly_settings: "Límite de alerta de potencia sincronizado",
  anomaly_settings_merged: "Límite de alerta recuperado y sincronizado",
  set_circuit_lock: "Bloqueo para VoltKids sincronizado",
  release_circuit_control: "Control del circuito liberado para VoltKids",
  permission_requested: "Nueva solicitud VoltKids recibida",
  permission_request_cancelled: "Solicitud VoltKids cancelada",
  permission_request_resolved: "Solicitud VoltKids respondida",
  permission_requests_merged: "Solicitudes VoltKids recuperadas y sincronizadas",
  permission_grant_expired: "Permiso temporal VoltKids finalizado",
  activity_recorded: "Historial de actividad sincronizado",
  activity_log_merged: "Historial de actividad recuperado",
  kids_missions_updated: "Progreso ecológico VoltKids sincronizado",
  kids_missions_merged: "Progreso ecológico VoltKids recuperado",
  circuit_archived: "Circuito archivado y sincronizado",
  circuit_restored: "Circuito recuperado y sincronizado",
  archived_circuit_deleted: "Circuito archivado eliminado",
  archived_circuits_merged: "Archivo de circuitos recuperado",
  backup_restored: "Configuración restaurada en todos los dispositivos",
  arduino_connected: "Arduino UNO R3 conectado por USB",
  arduino_local_toggle: "Circuito cambiado desde el Arduino",
  arduino_output_confirmed: "Salida física confirmada por Arduino",
  arduino_state: "Estado físico del Arduino comprobado",
  arduino_authoritative_state: "Estado recuperado desde el servidor Arduino",
  arduino_card_inserted: "Tarjeta detectada por Arduino",
  arduino_card_removed: "Tarjeta retirada desde Arduino",
  arduino_grid_available: "Red disponible según Arduino",
  arduino_grid_lost: "Pérdida de red detectada por Arduino",
  card_led_config_updated: "Indicador de tarjeta configurado en el Arduino",
  card_led_test_requested: "Prueba del indicador de tarjeta ejecutada",
  arduino_card_led_config: "Configuración del LED de tarjeta confirmada",
  arduino_card_led_test: "Pulso del LED de tarjeta confirmado",
};

function Panel({ children, style, styles }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

function StatusPill({ icon, label, color, styles }) {
  return (
    <View style={[styles.statusPill, { borderColor: `${color}55`, backgroundColor: `${color}12` }]}> 
      <Ionicons name={icon} size={13} color={color} />
      <Text style={[styles.statusPillText, { color }]}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title, caption, icon, styles, theme }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionMarker} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {!!caption && <Text style={styles.sectionCaption}>{caption}</Text>}
        </View>
      </View>
      {!!icon && <Ionicons name={icon} size={21} color={theme.accent} />}
    </View>
  );
}

function ProgressBar({ value, color, styles, theme }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.border }]}>
      <View style={[styles.progressFill, { width: `${safeValue}%`, backgroundColor: color }]} />
    </View>
  );
}

function MetricCard({ icon, label, value, unit, styles, theme, onPress }) {
  const content = <>
      <View style={styles.metricIcon}><Ionicons name={icon} size={19} color={theme.accentBright} /></View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}<Text style={styles.metricUnit}> {unit}</Text>
      </Text>
      {!!onPress && <View style={styles.metricOpenRow}><Text style={styles.metricOpenText}>VER ANÁLISIS</Text><Ionicons name="chevron-forward" size={12} color={theme.accentBright} /></View>}
    </>;
  if (!onPress) return <Panel style={styles.metricCard} styles={styles}>{content}</Panel>;
  return <Pressable accessibilityLabel={`Abrir análisis de ${label}`} onPress={onPress} style={({ pressed }) => [styles.panel, styles.metricCard, pressed && styles.pressed]}>{content}</Pressable>;
}

function BrandMark({ technical = false, size = 43, style }) {
  if (!technical) return <Image source={require("./assets/voltkey-icon.png")} style={[{ width: size, height: size }, style]} resizeMode="cover" />;
  return <View style={[{ width: size, height: size, overflow: "hidden" }, style]}>
    <Image
      source={require("./assets/voltkey-tec-logo.png")}
      style={{ position: "absolute", width: "270%", height: "270%", left: "-86%", top: "-160%" }}
      resizeMode="cover"
    />
  </View>;
}

function LargeCircuitGrid({ circuits, cardInserted, gridAvailable, onToggle, onPriority, onEdit, onToggleLock, styles, theme, desktop, restricted = false }) {
  return <View style={styles.largeCircuitGrid}>
    {circuits.map((circuit) => {
      const safetyLocked = (!cardInserted || !gridAvailable) && !circuit.essential;
      const adminLocked = restricted && circuit.adminLocked;
      const locked = safetyLocked || adminLocked;
      const stateLabel = safetyLocked ? "BLOQUEADO" : adminLocked ? "DECISIÓN DEL ADMIN" : circuit.on ? "ENCENDIDO" : "APAGADO";
      return <View key={`large-${circuit.id}`} style={styles.largeCircuitCard}>
        <Pressable
          feedback={circuit.on ? "off" : "on"}
          accessibilityLabel={`${circuit.name}: ${circuit.on ? "apagar" : "encender"}`}
          disabled={locked}
          onPress={() => onToggle(circuit.id, !circuit.on)}
          style={({ pressed }) => [styles.largeCircuitButton, circuit.on && styles.largeCircuitButtonOn, locked && styles.circuitLocked, pressed && styles.pressed]}
        >
          <View style={[styles.largeCircuitGraphic, circuit.on && styles.largeCircuitGraphicOn]}>
            {circuit.photoUri ? <Image source={{ uri: circuit.photoUri }} style={styles.largeCircuitPhoto} /> : <Ionicons name={circuit.icon || "flash-outline"} size={desktop ? 50 : 42} color={circuit.on ? theme.accentBright : theme.muted} />}
          </View>
          <Text style={styles.largeCircuitName} numberOfLines={2}>{circuit.name}</Text>
          {!restricted && <Text style={styles.largeCircuitPower}>{Number(circuit.power || 0).toLocaleString("es-CL")} W</Text>}
          <View style={[styles.largeCircuitState, { backgroundColor: adminLocked ? theme.warning : circuit.on ? theme.success : theme.border }]} /><Text style={[styles.largeCircuitStateText, { color: adminLocked ? theme.warning : circuit.on ? theme.success : theme.muted }]}>{stateLabel}</Text>
        </Pressable>
        {!restricted && <Pressable accessibilityLabel={`Editar ${circuit.name}`} onPress={() => onEdit(circuit)} style={({ pressed }) => [styles.largeCircuitEdit, pressed && styles.pressed]}><Ionicons name="create-outline" size={17} color={theme.text} /></Pressable>}
        {restricted ? <View style={[styles.childPermissionBadge, circuit.adminLocked && styles.adminControlBadge]}><Ionicons name={circuit.adminLocked ? "lock-closed" : "shield-checkmark-outline"} size={17} color={circuit.adminLocked ? theme.warning : theme.success} /><Text style={[styles.childPermissionText, circuit.adminLocked && { color: theme.warning }]}>{circuit.adminLocked ? "CONTROL ADMIN" : "AUTORIZADO"}</Text></View> : <>
          <Pressable accessibilityLabel={`${circuit.adminLocked ? "Liberar" : "Bloquear"} ${circuit.name} para VoltKids`} onPress={() => onToggleLock(circuit.id)} style={({ pressed }) => [styles.adminControlButton, !circuit.adminLocked && styles.adminControlButtonUnlocked, pressed && styles.pressed]}><Ionicons name={circuit.adminLocked ? "lock-open-outline" : "lock-closed-outline"} size={17} color={circuit.adminLocked ? theme.warning : theme.muted} /><Text style={[styles.adminControlButtonText, !circuit.adminLocked && { color: theme.muted }]}>{circuit.adminLocked ? "LIBERAR A VOLTKIDS" : "BLOQUEAR PARA VOLTKIDS"}</Text></Pressable>
          <Pressable accessibilityLabel={`${circuit.name}: ${circuit.essential ? "quitar prioridad" : "marcar como prioridad"}`} onPress={() => onPriority(circuit.id)} style={({ pressed }) => [styles.largeCircuitPriority, circuit.essential && styles.largeCircuitPriorityOn, pressed && styles.pressed]}>
          <Ionicons name={circuit.essential ? "star" : "star-outline"} size={21} color={circuit.essential ? theme.accentBright : theme.muted} />
          <Text style={[styles.largeCircuitPriorityText, circuit.essential && { color: theme.accentBright }]}>{circuit.essential ? "PRIORIDAD" : "SIN PRIORIDAD"}</Text>
          </Pressable>
        </>}
      </View>;
    })}
  </View>;
}

function AppHeader({ title, subtitle, connection, styles, theme, technical = false, kids = false, profile, onProfilePress, pendingRequests = 0, onRequestsPress }) {
  const online = connection === "online";
  const local = connection === "local";
  const statusColor = online || local ? theme.success : connection === "connecting" ? theme.warning : theme.danger;
  const statusLabel = online ? "ONLINE" : local ? "SIMULACIÓN" : connection === "connecting" ? "CONECTANDO" : "OFFLINE";
  return (
    <View style={styles.header}>
      <View style={styles.headerMainRow}>
        <View style={styles.headerIdentity}>
          <BrandMark technical={technical} size={43} style={styles.headerLogo} />
          <View style={{ flex: 1 }}>
            <Text style={styles.brand}>{technical ? "VOLTKEY TEC" : kids ? "VOLTKIDS" : EDITION_LABEL}</Text>
            <Text style={styles.headerTitle}>{title}</Text>
            {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
        </View>
        <View style={styles.headerActions}>
          <StatusPill icon={online ? "cloud-done-outline" : local ? "hardware-chip-outline" : "cloud-offline-outline"} label={statusLabel} color={statusColor} styles={styles} />
          {pendingRequests > 0 && <Pressable accessibilityLabel={`${pendingRequests} notificaciones pendientes`} onPress={onRequestsPress} style={({ pressed }) => [styles.headerNotificationButton, pressed && styles.pressed]}><Ionicons name="notifications" size={18} color={theme.warning} /><View style={styles.headerNotificationBadge}><Text style={styles.headerNotificationBadgeText}>{Math.min(99, pendingRequests)}</Text></View></Pressable>}
        </View>
      </View>
      {!!profile && !technical && <View style={styles.profileAccessRow}>
        <Pressable accessibilityLabel={`Cambiar perfil de uso. Perfil activo: ${profile.name}`} onPress={onProfilePress} style={({ pressed }) => [styles.profileAccessButton, pressed && styles.pressed]}>
          <View style={styles.profileAccessIcon}><Ionicons name={profile.icon || "person-outline"} size={17} color={theme.accentBright} /></View>
          <View style={{ flex: 1, minWidth: 0 }}><Text style={styles.profileAccessEyebrow}>PERFIL DE USO</Text><Text style={styles.profileAccessName} numberOfLines={1}>{profile.name} · {profile.role === "child" ? "VoltKids" : "Administrador"}</Text></View>
          <Ionicons name="chevron-forward" size={16} color={theme.muted} />
        </Pressable>
      </View>}
    </View>
  );
}

function AppNavigation({ active, onChange, items, desktop, styles, theme, technical = false, kids = false, profile, onProfilePress }) {
  if (desktop) {
    return (
      <View style={styles.desktopNavShell}>
        <View style={styles.desktopNavBrand}>
          <BrandMark technical={technical} size={39} style={styles.desktopNavLogo} />
          <View><Text style={styles.desktopNavEyebrow}>{kids ? "VOLT" : "VOLTKEY"}</Text><Text style={styles.desktopNavTitle}>{technical ? "TEC" : kids ? "KIDS" : "ALPHA"}</Text></View>
        </View>
        {!!profile && !technical && <Pressable accessibilityLabel={`Cambiar perfil. Perfil activo: ${profile.name}`} onPress={onProfilePress} style={({ pressed }) => [styles.desktopProfileButton, pressed && styles.pressed]}><View style={styles.desktopProfileIcon}><Ionicons name={profile.icon || "person-outline"} size={18} color={theme.accentBright} /></View><View style={{ flex: 1, minWidth: 0 }}><Text style={styles.desktopProfileEyebrow}>PERFIL DE USO</Text><Text style={styles.desktopProfileName} numberOfLines={1}>{profile.name}</Text></View><Ionicons name="swap-horizontal-outline" size={16} color={theme.muted} /></Pressable>}
        <View style={styles.desktopNavList}>
          {items.map((item) => {
            const selected = active === item.id;
            return (
              <Pressable key={item.id} onPress={() => onChange(item.id)}
                style={({ pressed }) => [styles.desktopNavButton, selected && styles.desktopNavButtonActive, pressed && styles.pressed]}
                accessibilityRole="button" accessibilityLabel={item.label}>
                <Ionicons name={selected ? item.activeIcon : item.icon} size={21} color={selected ? theme.accentBright : theme.muted} />
                <Text style={[styles.desktopNavLabel, selected && styles.desktopNavLabelActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.desktopNavVersion}>{technical ? "VOLTKEY TEC · ÁREA RESTRINGIDA" : kids ? "VOLTKIDS · CONTROL FAMILIAR" : EDITION_LABEL}</Text>
      </View>
    );
  }
  return (
    <View style={styles.navShell}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll} contentContainerStyle={styles.nav}>
        {items.map((item) => {
          const selected = active === item.id;
          return (
            <Pressable key={item.id} onPress={() => onChange(item.id)}
              style={({ pressed }) => [styles.navButton, selected && styles.navButtonActive, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={item.label}>
              <Ionicons name={selected ? item.activeIcon : item.icon} size={20} color={selected ? theme.accentBright : theme.muted} />
              <Text style={[styles.navLabel, selected && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ScreenScroller({ children, desktop, styles, theme, positionRef }) {
  const scrollRef = useRef(null);
  const restoreTimerRef = useRef(null);
  const [scrollY, setScrollY] = useState(() => Math.max(0, Number(positionRef?.current || 0)));
  const [contentHeight, setContentHeight] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  const canScroll = maxScroll > 8;
  const thumbPercent = canScroll ? Math.max(12, Math.min(100, viewportHeight / Math.max(contentHeight, 1) * 100)) : 100;
  const thumbTopPercent = canScroll ? scrollY / Math.max(maxScroll, 1) * (100 - thumbPercent) : 0;

  const move = (delta) => {
    const next = Math.max(0, Math.min(maxScroll, scrollY + delta));
    scrollRef.current?.scrollTo?.({ y: next, animated: true });
    setScrollY(next);
    if (positionRef) positionRef.current = next;
  };

  useEffect(() => () => {
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
  }, []);

  const restoreStoredPosition = (nextContentHeight, nextViewportHeight) => {
    const stored = Math.max(0, Number(positionRef?.current || 0));
    const nextMax = Math.max(0, nextContentHeight - nextViewportHeight);
    if (!stored || nextMax <= 0) return;
    if (restoreTimerRef.current) clearTimeout(restoreTimerRef.current);
    restoreTimerRef.current = setTimeout(() => {
      const target = Math.min(stored, nextMax);
      scrollRef.current?.scrollTo?.({ y: target, animated: false });
      setScrollY(target);
    }, 0);
  };

  return (
    <View style={styles.screenViewport}>
      <ScrollView
        ref={scrollRef}
        style={[styles.screenScroll, Platform.OS === "web" && styles.webScreenScroll]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={desktop}
        persistentScrollbar={desktop}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          setViewportHeight(nextHeight);
          restoreStoredPosition(contentHeight, nextHeight);
        }}
        onContentSizeChange={(_, nextHeight) => {
          setContentHeight(nextHeight);
          restoreStoredPosition(nextHeight, viewportHeight);
        }}
        onScroll={(event) => {
          const next = Math.max(0, event.nativeEvent.contentOffset.y);
          setScrollY(next);
          if (positionRef) positionRef.current = next;
        }}
      >
        {children}
      </ScrollView>
      {desktop && (
        <View style={styles.desktopScrollControls}>
          <Pressable
            accessibilityLabel="Subir en la pantalla"
            disabled={!canScroll || scrollY <= 1}
            onPress={() => move(-Math.max(320, viewportHeight * 0.72))}
            style={({ pressed }) => [styles.desktopScrollButton, (!canScroll || scrollY <= 1) && styles.desktopScrollButtonDisabled, pressed && styles.pressed]}
          ><Ionicons name="chevron-up" size={21} color={theme.text} /></Pressable>
          <View style={styles.desktopScrollTrack}><View style={[styles.desktopScrollThumb, { height: `${thumbPercent}%`, top: `${thumbTopPercent}%` }]} /></View>
          <Pressable
            accessibilityLabel="Bajar en la pantalla"
            disabled={!canScroll || scrollY >= maxScroll - 1}
            onPress={() => move(Math.max(320, viewportHeight * 0.72))}
            style={({ pressed }) => [styles.desktopScrollButton, (!canScroll || scrollY >= maxScroll - 1) && styles.desktopScrollButtonDisabled, pressed && styles.pressed]}
          ><Ionicons name="chevron-down" size={21} color={theme.text} /></Pressable>
          <Text style={styles.desktopScrollHint}>RUEDA</Text>
        </View>
      )}
    </View>
  );
}

function ModeTransitionOverlay({ target, normalTheme, font }) {
  const pulse = useRef(new Animated.Value(0.88)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const enteringTechnical = target === "technical";
  const overlayTheme = enteringTechnical ? TECHNICAL_PALETTE : normalTheme;

  useEffect(() => {
    pulse.setValue(0.88);
    opacity.setValue(0);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.loop(Animated.sequence([
        Animated.timing(pulse, { toValue: 1.04, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.92, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, pulse, target]);

  return (
    <Modal visible={Boolean(target)} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={[transitionStyles.safe, { backgroundColor: overlayTheme.bg }]}>
        <StatusBar barStyle="light-content" backgroundColor={overlayTheme.bg} />
        <Animated.View style={[transitionStyles.content, { opacity, transform: [{ scale: pulse }] }]}>
          {enteringTechnical ? <Image source={require("./assets/voltkey-tec-logo.png")} style={transitionStyles.tecLogo} resizeMode="contain" /> : <View style={[transitionStyles.logoFrame, { borderColor: overlayTheme.accent, shadowColor: overlayTheme.accent }]}> 
            <Image source={require("./assets/voltkey-icon.png")} style={transitionStyles.logo} resizeMode="cover" />
          </View>}
          <Text style={[transitionStyles.eyebrow, { color: overlayTheme.accentBright, fontFamily: font.bold }]}>{enteringTechnical ? "ACTIVANDO ENTORNO TÉCNICO" : "CERRANDO ENTORNO TÉCNICO"}</Text>
          <Text style={[transitionStyles.title, { color: overlayTheme.text, fontFamily: font.title }]}>{enteringTechnical ? "VOLTKEY TEC" : "VOLTKEY"}</Text>
          <View style={[transitionStyles.rule, { backgroundColor: overlayTheme.accent }]} />
          <Text style={[transitionStyles.warning, { color: overlayTheme.text, fontFamily: font.body }]}>{enteringTechnical ? "Trabaja con cuidado. Desenergiza, bloquea y verifica antes de intervenir." : "Restaurando tu paleta, navegación y configuración habitual."}</Text>
          <View style={[transitionStyles.progress, { borderColor: overlayTheme.border }]}><View style={[transitionStyles.progressFill, { backgroundColor: overlayTheme.accent }]} /></View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function KidsModeTransitionOverlay({ transition, font }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.86)).current;
  const enteringHacker = transition?.target === "hacker";
  const overlayTheme = enteringHacker ? KIDS_PALETTES.hacker : KIDS_PALETTES[transition?.target] || KIDS_PALETTES.dark;

  useEffect(() => {
    if (!transition) return undefined;
    opacity.setValue(0);
    scale.setValue(0.86);
    const animation = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [opacity, scale, transition]);

  return <Modal visible={Boolean(transition)} transparent={false} animationType="fade" statusBarTranslucent>
    <View style={[transitionStyles.safe, { backgroundColor: overlayTheme.bg }]}>
      <Animated.View style={[transitionStyles.content, { opacity, transform: [{ scale }] }]}>
        <View style={[transitionStyles.hackerIcon, { borderColor: overlayTheme.accentBright, backgroundColor: overlayTheme.surface }]}><Ionicons name={enteringHacker ? "terminal" : "happy-outline"} size={48} color={overlayTheme.accentBright} /></View>
        <Text style={[transitionStyles.eyebrow, { color: overlayTheme.accentBright, fontFamily: font.bold }]}>{enteringHacker ? "INICIANDO PROTOCOLO SEGURO" : "CERRANDO TERMINAL DE AGENTE"}</Text>
        <Text style={[transitionStyles.title, { color: overlayTheme.text, fontFamily: enteringHacker ? FONT_PRESETS.terminal.title : font.title }]}>{enteringHacker ? "VOLTKIDS HACKER" : "VOLTKIDS"}</Text>
        <View style={[transitionStyles.rule, { backgroundColor: overlayTheme.accent }]} />
        <Text style={[transitionStyles.warning, { color: overlayTheme.text, fontFamily: font.body }]}>{enteringHacker ? "Tus permisos siguen protegidos. Podrás aprender, observar y enviar solicitudes al administrador." : "Restaurando tu tema VoltKids y los controles sencillos."}</Text>
        <View style={[transitionStyles.progress, { borderColor: overlayTheme.border }]}><View style={[transitionStyles.progressFill, { backgroundColor: overlayTheme.accentBright }]} /></View>
      </Animated.View>
    </View>
  </Modal>;
}

const transitionStyles = StyleSheet.create({
  safe: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  content: { width: "100%", maxWidth: 560, alignItems: "center" },
  logoFrame: { width: 116, height: 116, borderRadius: 30, borderWidth: 2, padding: 7, shadowOpacity: 0.75, shadowRadius: 24, elevation: 12 },
  logo: { width: "100%", height: "100%", borderRadius: 22 },
  tecLogo: { width: 268, height: 268, borderRadius: 24 },
  eyebrow: { marginTop: 34, fontSize: 11, letterSpacing: 2, textAlign: "center" },
  title: { marginTop: 12, fontSize: 34, letterSpacing: 1.4, textAlign: "center" },
  rule: { width: 92, height: 3, borderRadius: 3, marginVertical: 22 },
  warning: { maxWidth: 470, fontSize: 16, lineHeight: 24, textAlign: "center" },
  progress: { width: 220, height: 7, borderRadius: 7, borderWidth: 1, overflow: "hidden", marginTop: 30 },
  progressFill: { width: "78%", height: "100%", borderRadius: 6 },
  hackerIcon: { width: 112, height: 112, borderRadius: 32, borderWidth: 2, alignItems: "center", justifyContent: "center" },
});

function KidsCircuitTimerModal({ action, styles, theme, onCancel }) {
  if (!action) return null;
  const turningOn = Boolean(action.value);
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
    <View style={styles.kidsTimerOverlay}>
      <View style={styles.kidsTimerCard}>
        <View style={[styles.kidsTimerIcon, { borderColor: turningOn ? theme.success : theme.warning }]}>
          <Ionicons name={turningOn ? "power" : "power-outline"} size={34} color={turningOn ? theme.success : theme.warning} />
        </View>
        <Text style={styles.kidsTimerEyebrow}>PROTECCIÓN VOLTKIDS</Text>
        <Text style={styles.kidsTimerTitle}>{turningOn ? "ENCENDIENDO" : "APAGANDO"}</Text>
        <Text style={styles.kidsTimerCircuit}>{action.name}</Text>
        <View style={[styles.kidsTimerCount, { borderColor: turningOn ? theme.success : theme.warning }]}>
          <Text style={[styles.kidsTimerValue, { color: turningOn ? theme.success : theme.warning }]}>{Math.max(0, action.seconds)}</Text>
          <Text style={styles.kidsTimerUnit}>SEGUNDOS</Text>
        </View>
        <Text style={styles.kidsTimerHelp}>La acción se aplicará al terminar la cuenta. Un administrador puede mantener o cambiar la decisión en cualquier momento.</Text>
        <Pressable accessibilityLabel="Cancelar acción VoltKids" onPress={onCancel} style={({ pressed }) => [styles.kidsTimerCancel, pressed && styles.pressed]}>
          <Ionicons name="close-circle-outline" size={20} color={theme.text} /><Text style={styles.kidsTimerCancelText}>CANCELAR</Text>
        </Pressable>
      </View>
    </View>
  </Modal>;
}

function IntroScreen({ styles, theme, onContinue, technical = false, kids = false }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;
  const glow = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 55, useNativeDriver: true }),
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.35, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])),
    ]).start();
  }, [glow, opacity, scale]);

  return (
    <Pressable style={styles.intro} onPress={onContinue}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <Animated.View style={[styles.introContent, { opacity, transform: [{ scale }] }]}> 
        <Animated.View style={[styles.introLogoOuter, { opacity: glow }]} />
        <BrandMark technical={technical} size={122} style={styles.introBrandIcon} />
        <Text style={styles.introEyebrow}>CONTROL ENERGÉTICO INTELIGENTE</Text>
        <Text style={styles.introTitle}>{kids ? "VOLT" : "VOLTKEY"}</Text>
        <Text style={styles.introTitleAccent}>{technical ? "TEC" : kids ? "KIDS" : "ALPHA"}</Text>
        <View style={styles.introRule} />
        <Text style={styles.introVersion}>{technical ? "VOLTKEY TEC" : kids ? `VOLTKIDS · ${EDITION_LABEL}` : EDITION_LABEL}</Text>
        <Text style={styles.introPurpose}>{kids ? "Control autorizado, aprendizaje y ahorro para toda la familia." : "Una aplicación para comprender, controlar y demostrar cómo la energía llega a cada circuito."}</Text>
      </Animated.View>
      <View style={styles.introFooter}>
        <Text style={styles.introHint}>TOCA PARA CONTINUAR</Text>
        <Ionicons name="chevron-down" size={19} color={theme.accent} />
      </View>
    </Pressable>
  );
}

function FormField({ label, value, onChangeText, styles, multiline = false, ...props }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#737984"
        multiline={multiline}
        style={[styles.formInput, multiline && styles.formInputMultiline]}
        {...props}
      />
    </View>
  );
}

function CircuitFormModal({
  visible, form, editing, styles, theme, onChange, onClose, onSave, onParseText,
  onPickPhoto, onOpenLink, onDelete, onArchive, onDuplicate, fixedCatalog = false,
}) {
  const selectedSource = SOURCE_OPTIONS.find((option) => option.id === form.sourceType) || SOURCE_OPTIONS[0];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <SafeAreaView style={styles.modalSafe}>
        <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
        <View style={styles.modalHeader}>
          <Pressable accessibilityLabel="Cerrar formulario" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}>
            <Ionicons name="close" size={23} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.modalEyebrow}>CONFIGURACIÓN ELÉCTRICA</Text>
            <Text style={styles.modalTitle}>{editing ? "EDITAR CIRCUITO" : "NUEVO CIRCUITO"}</Text>
          </View>
          <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>1/1</Text></View>
        </View>
        <ScrollView
          contentContainerStyle={styles.modalContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Panel styles={styles}>
            <SectionTitle title="IDENTIFICACIÓN" caption="Datos visibles para reconocer la carga" icon="hardware-chip-outline" styles={styles} theme={theme} />
            <FormField label="NOMBRE DEL CIRCUITO *" value={form.name} onChangeText={(value) => onChange("name", value)} placeholder="Ej.: Router e internet" styles={styles} maxLength={50} />
            <FormField label="HABITACIÓN O SECTOR" value={form.room} onChangeText={(value) => onChange("room", value)} placeholder="Ej.: Living, cocina o dormitorio 1" styles={styles} maxLength={40} />
            <Text style={styles.formLabel}>CATEGORÍA</Text>
            <View style={styles.chipGrid}>
              {CIRCUIT_CATEGORIES.map((category) => {
                const selected = form.category === category.id;
                return <Pressable key={category.id} onPress={() => onChange("category", category.id)} style={({ pressed }) => [styles.categoryChip, selected && styles.categoryChipActive, pressed && styles.pressed]}>
                  <Ionicons name={category.icon} size={15} color={selected ? theme.accentBright : theme.muted} />
                  <Text style={[styles.categoryChipText, selected && styles.categoryChipTextActive]}>{category.label}</Text>
                </Pressable>;
              })}
            </View>
            <View style={styles.formRow}>
              <View style={styles.formHalf}><FormField label="MARCA" value={form.brand} onChangeText={(value) => onChange("brand", value)} placeholder="Ej.: TP-Link" styles={styles} maxLength={40} /></View>
              <View style={styles.formHalf}><FormField label="MODELO" value={form.model} onChangeText={(value) => onChange("model", value)} placeholder="Ej.: AX55" styles={styles} maxLength={40} /></View>
            </View>
          </Panel>

          <Panel styles={styles}>
            <SectionTitle title="DATOS NOMINALES" caption="Consulta la placa del equipo o su ficha técnica" icon="speedometer-outline" styles={styles} theme={theme} />
            <View style={styles.formRow}>
              <View style={styles.formHalf}><FormField label="POTENCIA (W) *" value={form.power} onChangeText={(value) => onChange("power", value)} placeholder="150" styles={styles} keyboardType="decimal-pad" /></View>
              <View style={styles.formHalf}><FormField label="VOLTAJE (V)" value={form.voltage} onChangeText={(value) => onChange("voltage", value)} placeholder="220" styles={styles} keyboardType="decimal-pad" /></View>
            </View>
            <View style={styles.formRow}>
              <View style={styles.formHalf}><FormField label="CORRIENTE (A)" value={form.current} onChangeText={(value) => onChange("current", value)} placeholder="Se calcula" styles={styles} keyboardType="decimal-pad" /></View>
              <View style={styles.formHalf}><FormField label="AUTOMÁTICO (A)" value={form.breaker} onChangeText={(value) => onChange("breaker", value)} placeholder="Ej.: 10" styles={styles} keyboardType="decimal-pad" /></View>
            </View>
            <View style={styles.essentialFormRow}>
              <View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>CIRCUITO ESENCIAL</Text><Text style={styles.formSwitchHelp}>Continuará habilitado con batería o sin tarjeta.</Text></View>
              <Switch value={form.essential} onValueChange={(value) => onChange("essential", value)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={form.essential ? theme.accentBright : theme.muted} />
            </View>
            <FormField label="ALERTA INDIVIDUAL DE POTENCIA (W)" value={form.anomalyThreshold} onChangeText={(value) => onChange("anomalyThreshold", value)} placeholder="Ej.: 1800" styles={styles} keyboardType="decimal-pad" />
            <Text style={styles.formHint}>Si este circuito activo alcanza o supera el límite configurado, aparecerá en el centro de anomalías. Déjalo vacío para calcular un margen automático.</Text>
          </Panel>

          <Panel styles={styles}>
            <SectionTitle title="FUENTE DE INFORMACIÓN" caption="Guarda cómo se verificaron los datos técnicos" icon="file-tray-full-outline" styles={styles} theme={theme} />
            <View style={styles.sourceGrid}>
              {SOURCE_OPTIONS.map((option) => {
                const selected = form.sourceType === option.id;
                return <Pressable key={option.id} onPress={() => onChange("sourceType", option.id)} style={({ pressed }) => [styles.sourceOption, selected && styles.sourceOptionActive, pressed && styles.pressed]}>
                  <Ionicons name={option.icon} size={22} color={selected ? theme.accentBright : theme.muted} />
                  <Text style={[styles.sourceOptionText, selected && styles.sourceOptionTextActive]}>{option.label}</Text>
                </Pressable>;
              })}
            </View>
            <Text style={styles.sourceHelp}>{selectedSource.help}</Text>

            {form.sourceType === "text" && <>
              <FormField label="REGISTRO DE PLACA O FICHA" value={form.sourceText} onChangeText={(value) => onChange("sourceText", value)} placeholder={"Marca: ...\nModelo: ...\nPotencia: 150 W\nVoltaje: 220 V\nCorriente: 0,7 A"} styles={styles} multiline textAlignVertical="top" />
              <Pressable accessibilityLabel="Leer valores desde el texto" onPress={onParseText} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Ionicons name="scan-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>LEER DATOS DEL TEXTO</Text>
              </Pressable>
            </>}

            {form.sourceType === "photo" && <>
              {form.photoUri ? <Image source={{ uri: form.photoUri }} style={styles.photoPreview} resizeMode="cover" /> : <View style={styles.photoPlaceholder}><Ionicons name="image-outline" size={37} color={theme.muted} /><Text style={styles.photoPlaceholderText}>Aún no hay una foto adjunta</Text></View>}
              <View style={styles.formRow}>
                <Pressable accessibilityLabel="Tomar una foto" onPress={() => onPickPhoto("camera")} style={({ pressed }) => [styles.secondaryButton, styles.formHalf, pressed && styles.pressed]}><Ionicons name="camera-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>CÁMARA</Text></Pressable>
                <Pressable accessibilityLabel="Elegir foto de la galería" onPress={() => onPickPhoto("library")} style={({ pressed }) => [styles.secondaryButton, styles.formHalf, pressed && styles.pressed]}><Ionicons name="images-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>GALERÍA</Text></Pressable>
              </View>
              <Text style={styles.formHint}>La foto queda como respaldo visual. Confirma manualmente los valores eléctricos antes de controlar una carga real.</Text>
            </>}

            {form.sourceType === "link" && <>
              <FormField label="ENLACE A DATASHEET / PDF" value={form.datasheetUrl} onChangeText={(value) => onChange("datasheetUrl", value)} placeholder="https://fabricante.com/modelo.pdf" styles={styles} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
              {isWebUrl(form.datasheetUrl) && <Pressable accessibilityLabel="Abrir ficha técnica" onPress={onOpenLink} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="open-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>ABRIR Y COMPROBAR ENLACE</Text></Pressable>}
            </>}
          </Panel>

          <Panel styles={styles}>
            <FormField label="OBSERVACIONES" value={form.notes} onChangeText={(value) => onChange("notes", value)} placeholder="Ubicación, uso, advertencias o conexión física..." styles={styles} multiline textAlignVertical="top" maxLength={400} />
          </Panel>

          {editing && !fixedCatalog && <View style={styles.circuitEditActions}>
            <Pressable feedback="confirm" accessibilityLabel="Duplicar este circuito" onPress={onDuplicate} style={({ pressed }) => [styles.secondaryButton, styles.circuitEditAction, pressed && styles.pressed]}><Ionicons name="copy-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>DUPLICAR</Text></Pressable>
            <Pressable accessibilityLabel="Archivar este circuito" onPress={onArchive} style={({ pressed }) => [styles.secondaryButton, styles.circuitEditAction, pressed && styles.pressed]}><Ionicons name="archive-outline" size={18} color={theme.warning} /><Text style={[styles.secondaryButtonText, { color: theme.warning }]}>ARCHIVAR</Text></Pressable>
          </View>}
          {editing && !fixedCatalog && <Pressable feedback="delete" accessibilityLabel="Eliminar definitivamente este circuito" onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color={theme.danger} /><Text style={styles.deleteButtonText}>ELIMINAR DEFINITIVAMENTE</Text></Pressable>}
          {editing && fixedCatalog && <View style={styles.anomalySafetyPanel}><Ionicons name="hardware-chip-outline" size={22} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>Este circuito puede editarse por completo, pero su posición física está reservada para el prototipo Arduino Test de tres salidas.</Text></View>}
          <Text style={styles.formDisclaimer}>Los datos ingresados son informativos. La selección de protecciones y el montaje deben ser revisados por un instalador eléctrico autorizado.</Text>
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable feedback="confirm" accessibilityLabel="Guardar circuito" onPress={onSave} style={({ pressed }) => [styles.primaryButton, styles.modalSaveButton, pressed && styles.pressed]}>
            <Ionicons name="save-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>{editing ? "GUARDAR CAMBIOS" : "AÑADIR CIRCUITO"}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function MetricDetailModal({ visible, metricId, analysis, records, styles, theme, periodLabel, source, onClose }) {
  if (!metricId || !analysis) return null;
  const definition = METRIC_DEFINITIONS[metricId];
  const field = metricId === "consumption" ? "consumption" : metricId === "cost" ? "cost" : metricId;
  const chartRecords = (records || []).slice(-28);
  const values = chartRecords.map((record) => Number(record[field] || 0));
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(max - min, 0.01);
  const stabilityColor = analysis.score >= 96 ? theme.success : analysis.score >= 65 ? theme.warning : theme.danger;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar análisis" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>HISTORIAL Y DIAGNÓSTICO</Text><Text style={styles.modalTitle}>{definition.title}</Text></View>
        <StatusPill icon="analytics-outline" label={periodLabel.toUpperCase()} color={theme.accentBright} styles={styles} />
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
        <Panel style={styles.analysisHero} styles={styles}>
          <View style={styles.analysisStatusRow}>
            <View><Text style={styles.overline}>ESTADO DE LA CONEXIÓN</Text><Text style={[styles.analysisStatus, { color: stabilityColor }]}>{analysis.status.toUpperCase()}</Text></View>
            <View style={[styles.analysisScore, { borderColor: stabilityColor }]}><Text style={[styles.analysisScoreValue, { color: stabilityColor }]}>{analysis.score}%</Text><Text style={styles.analysisScoreLabel}>ESTABILIDAD</Text></View>
          </View>
          <ProgressBar value={analysis.score} color={stabilityColor} styles={styles} theme={theme} />
          <Text style={styles.analysisSource}>Origen: {source === "simulation" ? "datos de simulación" : source === "mixed" ? "datos simulados y reales" : "mediciones del servidor"}</Text>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="FÓRMULA Y CONVERSIÓN" caption={definition.formulaName} icon="calculator-outline" styles={styles} theme={theme} />
          <View style={styles.formulaBox}><Text style={styles.formulaMain}>{definition.formula}</Text><Text style={styles.formulaSubstitution}>{analysis.substitution}</Text></View>
          <Text style={styles.analysisBody}>{definition.explanation}</Text>
          <View style={styles.conversionRow}><Text style={styles.conversionLabel}>CONVERSIÓN ACTUAL</Text><Text style={styles.conversionValue}>{analysis.conversion}</Text></View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title={`TENDENCIA · ${periodLabel.toUpperCase()}`} caption={`${records.length} registros disponibles`} icon="pulse-outline" styles={styles} theme={theme} />
          <View style={styles.miniChart}>{chartRecords.map((record, index) => {
            const value = Number(record[field] || 0);
            const height = 18 + (value - min) / range * 74;
            return <View key={`${record.timestamp}-${index}`} style={[styles.miniChartBar, { height, backgroundColor: metricId === "voltage" && (value < 198 || value > 242) ? theme.danger : theme.accent }]} />;
          })}</View>
          <View style={styles.analysisStats}>
            <View style={styles.analysisStat}><Text style={styles.analysisStatLabel}>MÍNIMO</Text><Text style={styles.analysisStatValue}>{analysis.min.toFixed(metricId === "cost" ? 0 : 2)} {definition.unit}</Text></View>
            <View style={styles.analysisStat}><Text style={styles.analysisStatLabel}>PROMEDIO</Text><Text style={styles.analysisStatValue}>{analysis.average.toFixed(metricId === "cost" ? 0 : 2)} {definition.unit}</Text></View>
            <View style={styles.analysisStat}><Text style={styles.analysisStatLabel}>MÁXIMO</Text><Text style={styles.analysisStatValue}>{analysis.max.toFixed(metricId === "cost" ? 0 : 2)} {definition.unit}</Text></View>
          </View>
        </Panel>

        <Panel style={analysis.lastAnomaly ? styles.anomalyPanel : styles.okPanel} styles={styles}>
          <SectionTitle title={analysis.lastAnomaly ? "ÚLTIMA ANOMALÍA" : "SIN ANOMALÍAS RECIENTES"} caption={analysis.lastAnomaly ? dateTimeLabel(analysis.lastAnomaly.timestamp) : "El periodo se mantiene dentro de los límites configurados"} icon={analysis.lastAnomaly ? "warning-outline" : "checkmark-circle-outline"} styles={styles} theme={theme} />
          {analysis.lastAnomaly && <View style={styles.anomalyValueRow}><Text style={styles.anomalyType}>{analysis.lastAnomaly.type}</Text><Text style={styles.anomalyValue}>{Number(analysis.lastAnomaly.value).toFixed(1)} {analysis.lastAnomaly.unit}</Text></View>}
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="CÓMO ACTUAR" caption="Soporte y mantención recomendada" icon="construct-outline" styles={styles} theme={theme} />
          <Text style={styles.analysisBody}>{definition.solution}</Text>
          <View style={styles.maintenanceRow}><Ionicons name="build-outline" size={19} color={theme.accentBright} /><View style={{ flex: 1 }}><Text style={styles.maintenanceTitle}>MANTENCIÓN</Text><Text style={styles.maintenanceText}>{definition.maintenance}</Text></View></View>
        </Panel>
        <Text style={styles.formDisclaimer}>El diagnóstico es orientativo y usa límites configurados para el simulador. Una anomalía real debe comprobarse con instrumentos adecuados por personal autorizado.</Text>
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function AnomalyDetailModal({ anomaly, styles, theme, onClose, onSave }) {
  const [status, setStatus] = useState("open");
  const [note, setNote] = useState("");

  useEffect(() => {
    setStatus(anomaly?.status || "open");
    setNote(anomaly?.note || "");
  }, [anomaly]);

  if (!anomaly) return null;
  const guidance = anomaly.guidance || getAnomalyGuidance(anomaly);
  const severityColor = anomaly.severity === "critical" ? theme.danger : theme.warning;
  const metricLabel = ANOMALY_METRIC_OPTIONS.find((option) => option.id === anomaly.metric)?.label || "Sistema";
  const numericValue = Number(anomaly.value);
  const valueLabel = Number.isFinite(numericValue) ? `${numericValue.toFixed(1)} ${anomaly.unit || ""}`.trim() : "Sin valor";

  return <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar detalle de anomalía" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>REGISTRO DE ANOMALÍAS</Text><Text style={styles.modalTitle}>{anomaly.type?.toUpperCase() || "EVENTO ELÉCTRICO"}</Text></View>
        <StatusPill icon="warning-outline" label={anomaly.severity === "critical" ? "CRÍTICA" : "ADVERTENCIA"} color={severityColor} styles={styles} />
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Panel style={[styles.anomalyDetailHero, { borderColor: `${severityColor}99` }]} styles={styles}>
          <View style={styles.anomalyDetailTop}><View style={[styles.anomalyDetailIcon, { backgroundColor: `${severityColor}18`, borderColor: severityColor }]}><Ionicons name="warning" size={28} color={severityColor} /></View><View style={{ flex: 1 }}><Text style={styles.anomalyDetailTitle}>{guidance.title}</Text><Text style={styles.anomalyDetailDate}>{dateTimeLabel(anomaly.timestamp)}</Text></View><View><Text style={styles.anomalyDetailMetric}>{metricLabel.toUpperCase()}</Text><Text style={styles.anomalyDetailValue}>{valueLabel}</Text></View></View>
          {!!anomaly.details && <Text style={styles.anomalyDetailDescription}>{anomaly.details}</Text>}
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="ESTADO DEL SEGUIMIENTO" caption="El estado y la nota se sincronizan entre celular y computador" icon="checkmark-done-outline" styles={styles} theme={theme} />
          <View style={styles.anomalyStatusGrid}>{ANOMALY_STATUS_OPTIONS.filter((option) => option.id !== "all").map((option) => {
            const selected = status === option.id;
            return <Pressable key={option.id} accessibilityLabel={`Marcar como ${option.label}`} onPress={() => setStatus(option.id)} style={({ pressed }) => [styles.anomalyStatusButton, selected && styles.anomalyStatusButtonActive, pressed && styles.pressed]}><Ionicons name={option.id === "resolved" ? "checkmark-circle-outline" : option.id === "reviewed" ? "eye-outline" : "time-outline"} size={17} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.anomalyStatusButtonText, selected && styles.anomalyStatusButtonTextActive]}>{option.label.toUpperCase()}</Text></Pressable>;
          })}</View>
          <FormField label="NOTA DE REVISIÓN" value={note} onChangeText={(value) => setNote(value.slice(0, 500))} placeholder="Ej.: Se revisó el tablero; solicitar visita técnica si vuelve a ocurrir." styles={styles} multiline textAlignVertical="top" maxLength={500} />
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="CAUSAS POSIBLES" caption="Puntos que conviene comprobar antes de cerrar el evento" icon="search-outline" styles={styles} theme={theme} />
          {guidance.causes.map((cause, index) => <View key={`${cause}-${index}`} style={styles.anomalyCauseRow}><View style={styles.anomalyCauseNumber}><Text style={styles.anomalyCauseNumberText}>{index + 1}</Text></View><Text style={styles.anomalyCauseText}>{cause}</Text></View>)}
        </Panel>

        <Panel style={styles.anomalyActionPanel} styles={styles}>
          <SectionTitle title="ACCIÓN INMEDIATA" caption="Medida prudente mientras se determina la causa" icon="flash-outline" styles={styles} theme={theme} />
          <Text style={styles.anomalyAdviceText}>{guidance.immediate}</Text>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="SOPORTE Y MANTENCIÓN" caption="Cómo sustentar y escalar el problema" icon="construct-outline" styles={styles} theme={theme} />
          <Text style={styles.anomalyAdviceText}>{guidance.support}</Text>
        </Panel>
        <Text style={styles.formDisclaimer}>VoltKey entrega orientación preventiva. No intervengas partes energizadas; una falla real debe ser comprobada por personal autorizado.</Text>
      </ScrollView>
      <View style={styles.modalFooter}><Pressable accessibilityLabel="Guardar seguimiento de la anomalía" onPress={() => onSave(anomaly, status, note)} style={({ pressed }) => [styles.primaryButton, styles.modalSaveButton, pressed && styles.pressed]}><Ionicons name="save-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>GUARDAR SEGUIMIENTO</Text></Pressable></View>
    </SafeAreaView>
  </Modal>;
}

function ScheduleModal({ visible, form, circuits, styles, theme, connected, onChange, onToggleDay, onClose, onSave, onDelete }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar temporizador" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>PROGRAMADOR DIGITAL</Text><Text style={styles.modalTitle}>{form.id ? "EDITAR HORARIO" : "NUEVO HORARIO"}</Text></View>
        <StatusPill icon={connected ? "cloud-done-outline" : "phone-portrait-outline"} label={connected ? "SERVIDOR" : "LOCAL"} color={connected ? theme.success : theme.warning} styles={styles} />
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Panel styles={styles}>
          <SectionTitle title="CIRCUITO" caption="Selecciona la carga que se controlará" icon="git-network-outline" styles={styles} theme={theme} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circuitPicker}>
            {circuits.map((circuit) => {
              const selected = String(form.circuitId) === String(circuit.id);
              return <Pressable key={circuit.id} onPress={() => onChange("circuitId", circuit.id)} style={({ pressed }) => [styles.circuitPickerItem, selected && styles.circuitPickerItemActive, pressed && styles.pressed]}>
                <Ionicons name={circuit.icon || "flash-outline"} size={18} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.circuitPickerText, selected && styles.circuitPickerTextActive]}>{circuit.name}</Text><Text style={styles.circuitPickerPower}>{Number(circuit.power || 0).toLocaleString("es-CL")} W</Text>
              </Pressable>;
            })}
          </ScrollView>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="HORARIO" caption="Formato de 24 horas: HH:MM" icon="time-outline" styles={styles} theme={theme} />
          <View style={styles.formRow}>
            <View style={styles.formHalf}><FormField label="ENCENDER A LAS" value={form.start} onChangeText={(value) => onChange("start", value)} placeholder="08:00" styles={styles} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
            <View style={styles.formHalf}><FormField label="APAGAR A LAS" value={form.end} onChangeText={(value) => onChange("end", value)} placeholder="18:00" styles={styles} keyboardType="numbers-and-punctuation" maxLength={5} /></View>
          </View>
          <Text style={styles.formLabel}>DÍAS DE FUNCIONAMIENTO</Text>
          <View style={styles.dayGrid}>{DAY_OPTIONS.map((day) => {
            const selected = form.days.includes(day.id);
            return <Pressable key={day.id} accessibilityLabel={day.long} onPress={() => onToggleDay(day.id)} style={({ pressed }) => [styles.dayButton, selected && styles.dayButtonActive, pressed && styles.pressed]}><Text style={[styles.dayButtonText, selected && styles.dayButtonTextActive]}>{day.label}</Text></Pressable>;
          })}</View>
          <View style={styles.essentialFormRow}><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>TEMPORIZADOR HABILITADO</Text><Text style={styles.formSwitchHelp}>El servidor aplicará el horario incluso con la app cerrada.</Text></View><Switch value={form.enabled} onValueChange={(value) => onChange("enabled", value)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={form.enabled ? theme.accentBright : theme.muted} /></View>
        </Panel>
        <Panel style={styles.timerExplanation} styles={styles}><Ionicons name="information-circle-outline" size={22} color={theme.accentBright} /><Text style={styles.timerExplanationText}>Si el horario cruza medianoche, por ejemplo 22:00–06:00, los días seleccionados corresponden al día en que comienza el encendido.</Text></Panel>
        {!!form.id && <Pressable accessibilityLabel="Eliminar temporizador" onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color={theme.danger} /><Text style={styles.deleteButtonText}>ELIMINAR TEMPORIZADOR</Text></Pressable>}
      </ScrollView>
      <View style={styles.modalFooter}><Pressable accessibilityLabel="Guardar temporizador" onPress={onSave} style={({ pressed }) => [styles.primaryButton, styles.modalSaveButton, pressed && styles.pressed]}><Ionicons name="save-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>GUARDAR PROGRAMACIÓN</Text></Pressable></View>
    </SafeAreaView>
  </Modal>;
}

function ProfileSwitcherModal({ visible, profiles, activeProfile, pendingRequests = 0, technical = false, styles, theme, onClose, onSelect, onManage, onRequestsPress }) {
  const visibleProfiles = technical ? profiles.filter((profile) => profile.role === "normal") : profiles;
  const visiblePendingRequests = technical ? 0 : pendingRequests;
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar perfiles" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>FAMILIA VOLTKEY</Text><Text style={styles.modalTitle}>CAMBIAR PERFIL</Text></View>
        <BrandMark technical={technical} size={42} style={styles.profileModalLogo} />
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
        <Panel style={styles.profileActivePanel} styles={styles}>
          <View style={styles.profileActiveIcon}><Ionicons name={activeProfile?.icon || "person-outline"} size={27} color={theme.accentBright} /></View>
          <View style={{ flex: 1 }}><Text style={styles.profileEyebrow}>PERFIL ACTIVO</Text><Text style={styles.profileActiveName}>{activeProfile?.name || "Familia"}</Text><Text style={styles.profileActiveDescription}>{activeProfile?.role === "child" ? "VoltKids · circuitos autorizados" : "Perfil administrador · control absoluto"}</Text></View>
        </Panel>
        <SectionTitle title="¿QUIÉN ESTÁ USANDO VOLTKEY?" caption={technical ? "VoltKey Tec muestra únicamente perfiles administradores" : "VoltKids mantiene únicamente los permisos aprobados por un administrador"} icon="people-outline" styles={styles} theme={theme} />
        <View style={styles.profileSwitchGrid}>{visibleProfiles.map((profile) => {
          const selected = activeProfile?.id === profile.id;
          return <Pressable key={profile.id} accessibilityLabel={`Usar perfil ${profile.name}`} onPress={() => onSelect(profile)} style={({ pressed }) => [styles.profileSwitchCard, selected && styles.optionSelected, pressed && styles.pressed]}>
            <View style={[styles.profileSwitchIcon, selected && styles.profileSwitchIconActive]}><Ionicons name={profile.icon || "person-outline"} size={30} color={selected ? theme.accentBright : theme.muted} /></View>
            <Text style={styles.profileSwitchName} numberOfLines={1}>{profile.name}</Text>
            <Text style={styles.profileSwitchRole}>{profile.role === "child" ? "VOLTKIDS" : "ADMINISTRADOR"}</Text>
            <Text style={styles.profileSwitchMeta}>{profile.role === "child" ? `${profile.allowedCircuitIds?.length || 0} circuitos permitidos · sujeto a prioridad administrativa` : `${profile.pinHash ? "Control absoluto · PIN" : "Control absoluto · PIN pendiente"}${visiblePendingRequests ? ` · ${visiblePendingRequests} solicitud${visiblePendingRequests === 1 ? "" : "es"}` : ""}`}</Text>
            <View style={styles.profileSwitchState}><Ionicons name={selected ? "checkmark-circle" : profile.role === "normal" ? "lock-closed-outline" : "shield-checkmark-outline"} size={17} color={selected ? theme.success : theme.muted} /><Text style={[styles.profileSwitchStateText, selected && { color: theme.success }]}>{selected ? "ACTIVO" : "SELECCIONAR"}</Text></View>
          </Pressable>;
        })}</View>
        <Panel style={styles.profileInfoPanel} styles={styles}><Ionicons name={technical ? "construct-outline" : "information-circle-outline"} size={21} color={theme.accentBright} /><Text style={styles.profileInfoText}>{technical ? "Los perfiles VoltKids permanecen ocultos mientras el entorno técnico está activo. Sal de VoltKey Tec para volver a utilizarlos." : "El administrador define permisos y sus decisiones tienen prioridad. Para salir de VoltKids se solicitará el PIN del administrador elegido."}</Text></Panel>
        {activeProfile?.role === "normal" && visiblePendingRequests > 0 && <Pressable accessibilityLabel="Abrir solicitudes VoltKids" onPress={onRequestsPress} style={({ pressed }) => [styles.permissionCenterButton, pressed && styles.pressed]}><Ionicons name="notifications" size={20} color={theme.warning} /><View style={{ flex: 1 }}><Text style={styles.permissionCenterButtonTitle}>SOLICITUDES VOLTKIDS</Text><Text style={styles.permissionCenterButtonText}>{visiblePendingRequests} esperando respuesta del administrador</Text></View><Ionicons name="chevron-forward" size={18} color={theme.warning} /></Pressable>}
        {activeProfile?.role === "normal" && <Pressable accessibilityLabel="Administrar perfiles familiares" onPress={onManage} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="settings-outline" size={19} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>ADMINISTRAR PERFILES</Text></Pressable>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function PermissionRequestsModal({ visible, requests, profiles, circuits, styles, theme, onClose, onResolve }) {
  const pending = requests.filter((request) => request.status === "pending").sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const history = requests.filter((request) => request.status !== "pending").sort((a, b) => String(b.resolvedAt || b.createdAt).localeCompare(String(a.resolvedAt || a.createdAt))).slice(0, 30);
  const requestStatus = (status) => status === "approved" ? "ACTIVA" : status === "used" ? "UTILIZADA" : status === "expired" ? "VENCIDA" : status === "denied" ? "RECHAZADA" : "CANCELADA";
  const requestColor = (status) => status === "approved" ? theme.success : status === "denied" ? theme.danger : theme.muted;
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar solicitudes VoltKids" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>NOTIFICACIONES DEL ADMINISTRADOR</Text><Text style={styles.modalTitle}>SOLICITUDES VOLTKIDS</Text></View>
        <View style={[styles.permissionRequestCount, { borderColor: pending.length ? theme.warning : theme.success }]}><Text style={[styles.permissionRequestCountValue, { color: pending.length ? theme.warning : theme.success }]}>{pending.length}</Text><Text style={styles.permissionRequestCountLabel}>PENDIENTES</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
        <Panel style={styles.permissionIntroPanel} styles={styles}><Ionicons name="shield-checkmark-outline" size={24} color={theme.accentBright} /><Text style={styles.permissionIntroText}>VoltKids puede pedir acceso desde el modo Hacker, pero nunca lo obtiene automáticamente. Solo un administrador puede aprobarlo.</Text></Panel>
        <SectionTitle title="ESPERANDO RESPUESTA" caption="Revisa el perfil y el circuito antes de decidir" icon="notifications-outline" styles={styles} theme={theme} />
        {pending.length ? <View style={styles.permissionRequestList}>{pending.map((request) => {
          const profile = profiles.find((item) => item.id === request.profileId);
          const circuit = circuits.find((item) => String(item.id) === String(request.circuitId));
          return <Panel key={request.id} style={styles.permissionRequestCard} styles={styles}>
            <View style={styles.permissionRequestTop}><View style={styles.permissionRequestIcon}><Ionicons name={circuit?.icon || "flash-outline"} size={23} color={theme.warning} /></View><View style={{ flex: 1 }}><Text style={styles.permissionRequestTitle}>{circuit?.name || request.circuitName}</Text><Text style={styles.permissionRequestMeta}>{profile?.name || request.profileName} · {dateTimeLabel(request.createdAt)}</Text></View><Text style={styles.permissionRequestPending}>PENDIENTE</Text></View>
            <Text style={styles.permissionRequestText}>{profile?.name || request.profileName} solicita controlar este circuito. Elige cuánto tiempo durará el permiso.</Text>
            <View style={styles.permissionGrantGrid}>{PERMISSION_GRANT_OPTIONS.map((option) => <Pressable key={`${request.id}-${option.id}`} accessibilityLabel={`Autorizar ${option.label.toLowerCase()}`} onPress={() => onResolve(request.id, "approved", option.id)} style={({ pressed }) => [styles.permissionGrantButton, pressed && styles.pressed]}><Ionicons name={option.icon} size={18} color={theme.onAccent} /><Text style={styles.permissionGrantTitle}>{option.label}</Text><Text style={styles.permissionGrantText}>{option.description}</Text></Pressable>)}</View>
            <Pressable feedback="delete" accessibilityLabel={`Rechazar acceso a ${circuit?.name || request.circuitName}`} onPress={() => onResolve(request.id, "denied", null)} style={({ pressed }) => [styles.permissionDenyButton, pressed && styles.pressed]}><Ionicons name="close-circle-outline" size={18} color={theme.danger} /><Text style={styles.permissionDenyText}>RECHAZAR SOLICITUD</Text></Pressable>
          </Panel>;
        })}</View> : <Panel style={styles.permissionEmptyPanel} styles={styles}><Ionicons name="checkmark-circle-outline" size={38} color={theme.success} /><Text style={styles.permissionEmptyTitle}>TODO REVISADO</Text><Text style={styles.permissionEmptyText}>No hay solicitudes VoltKids esperando una decisión.</Text></Panel>}
        {!!history.length && <><SectionTitle title="HISTORIAL RECIENTE" caption="Últimas decisiones administrativas" icon="time-outline" styles={styles} theme={theme} /><View style={styles.permissionHistoryList}>{history.map((request) => <View key={request.id} style={styles.permissionHistoryRow}><Ionicons name={request.status === "approved" ? "checkmark-circle" : request.status === "denied" ? "close-circle" : "remove-circle"} size={19} color={requestColor(request.status)} /><View style={{ flex: 1 }}><Text style={styles.permissionHistoryTitle}>{request.profileName} · {request.circuitName}</Text><Text style={styles.permissionHistoryMeta}>{dateTimeLabel(request.resolvedAt || request.createdAt)}{request.grantScope ? ` · ${PERMISSION_GRANT_OPTIONS.find((option) => option.id === request.grantScope)?.label || request.grantScope}` : ""}</Text></View><Text style={[styles.permissionHistoryStatus, { color: requestColor(request.status) }]}>{requestStatus(request.status)}</Text></View>)}</View></>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function ProfilePinModal({ visible, profile, value, error, styles, theme, onChange, onClose, onConfirm }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.pinBackdrop}>
      <View style={styles.pinCard}>
        <View style={styles.pinIcon}><Ionicons name="lock-closed" size={27} color={theme.accentBright} /></View>
        <Text style={styles.pinTitle}>ADMINISTRADOR {profile?.name?.toUpperCase() || "FAMILIA"}</Text>
        <Text style={styles.pinDescription}>Ingresa el PIN de cuatro dígitos para recuperar el control completo.</Text>
        <TextInput value={value} onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 4))} secureTextEntry keyboardType="number-pad" maxLength={4} autoFocus placeholder="••••" placeholderTextColor={theme.muted} style={[styles.pinInput, error && styles.pinInputError]} />
        {!!error && <Text style={styles.pinError}>{error}</Text>}
        <View style={styles.pinActions}><Pressable accessibilityLabel="Cancelar PIN" onPress={onClose} style={({ pressed }) => [styles.pinCancel, pressed && styles.pressed]}><Text style={styles.pinCancelText}>CANCELAR</Text></Pressable><Pressable accessibilityLabel="Confirmar PIN" onPress={onConfirm} style={({ pressed }) => [styles.pinConfirm, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>ENTRAR</Text></Pressable></View>
      </View>
    </View>
  </Modal>;
}

function ProfileFormModal({ visible, form, editing, circuits, styles, theme, onChange, onToggleCircuit, onClose, onSave, onDelete }) {
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
    <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar editor de perfil" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>ADMINISTRACIÓN FAMILIAR</Text><Text style={styles.modalTitle}>{editing ? "EDITAR PERFIL" : "NUEVO PERFIL"}</Text></View>
        <View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{form.role === "child" ? "VOLTKIDS" : "ADMIN"}</Text></View>
      </View>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Panel styles={styles}>
          <SectionTitle title="IDENTIDAD" caption="Nombre e icono que verá la familia" icon="person-circle-outline" styles={styles} theme={theme} />
          <FormField label="NOMBRE DEL PERFIL" value={form.name} onChangeText={(value) => onChange("name", value)} placeholder="Ej.: Mamá, Papá o Niños" styles={styles} maxLength={32} />
          <Text style={styles.formLabel}>ICONO</Text>
          <View style={styles.profileIconGrid}>{PROFILE_ICONS.map((icon) => <Pressable key={icon} accessibilityLabel={`Icono ${icon}`} onPress={() => onChange("icon", icon)} style={({ pressed }) => [styles.profileIconOption, form.icon === icon && styles.profileIconOptionActive, pressed && styles.pressed]}><Ionicons name={icon} size={23} color={form.icon === icon ? theme.accentBright : theme.muted} /></Pressable>)}</View>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="TIPO DE PERFIL" caption="Define el nivel de control y la interfaz" icon="shield-half-outline" styles={styles} theme={theme} />
          <View style={styles.profileRoleGrid}>
            <Pressable accessibilityLabel="Perfil administrador" onPress={() => onChange("role", "normal")} style={({ pressed }) => [styles.profileRoleOption, form.role === "normal" && styles.optionSelected, pressed && styles.pressed]}><Ionicons name="key-outline" size={25} color={form.role === "normal" ? theme.accentBright : theme.muted} /><Text style={styles.profileRoleTitle}>Administrador</Text><Text style={styles.profileRoleText}>Control absoluto, decisiones prioritarias y acceso a VoltKey Tec.</Text></Pressable>
            <Pressable accessibilityLabel="Perfil VoltKids" onPress={() => onChange("role", "child")} style={({ pressed }) => [styles.profileRoleOption, form.role === "child" && styles.optionSelected, pressed && styles.pressed]}><Ionicons name="happy-outline" size={25} color={form.role === "child" ? theme.accentBright : theme.muted} /><Text style={styles.profileRoleTitle}>VoltKids</Text><Text style={styles.profileRoleText}>Interfaz sencilla y solo circuitos autorizados que no estén bajo decisión administrativa.</Text></Pressable>
          </View>
        </Panel>
        {form.role === "normal" ? <Panel styles={styles}>
          <SectionTitle title="PIN DEL PERFIL" caption={editing ? "Déjalo vacío para conservar el PIN actual" : "Obligatorio para proteger el control absoluto"} icon="lock-closed-outline" styles={styles} theme={theme} />
          <FormField label="PIN DE 4 DÍGITOS" value={form.pin} onChangeText={(value) => onChange("pin", value.replace(/\D/g, "").slice(0, 4))} placeholder={editing ? "PIN sin cambios" : "••••"} styles={styles} secureTextEntry keyboardType="number-pad" maxLength={4} />
          <Text style={styles.formHint}>Protección básica para el prototipo. No reutilices contraseñas bancarias ni personales.</Text>
        </Panel> : <Panel styles={styles}>
          <SectionTitle title="CIRCUITOS AUTORIZADOS" caption={`${form.allowedCircuitIds.length} seleccionados · aparecerán como botones grandes`} icon="bed-outline" styles={styles} theme={theme} />
          {circuits.map((circuit, index) => {
            const selected = form.allowedCircuitIds.some((id) => String(id) === String(circuit.id));
            return <View key={`permission-${circuit.id}`}><Pressable accessibilityLabel={`${selected ? "Quitar" : "Permitir"} ${circuit.name}`} onPress={() => onToggleCircuit(circuit.id)} style={({ pressed }) => [styles.profilePermissionRow, selected && styles.profilePermissionRowActive, pressed && styles.pressed]}><View style={[styles.profilePermissionIcon, selected && styles.profilePermissionIconActive]}><Ionicons name={circuit.icon || "flash-outline"} size={19} color={selected ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.profilePermissionName}>{circuit.name}</Text><Text style={styles.profilePermissionMeta}>{Number(circuit.power || 0).toLocaleString("es-CL")} W</Text></View><Ionicons name={selected ? "checkbox" : "square-outline"} size={22} color={selected ? theme.success : theme.muted} /></Pressable>{index < circuits.length - 1 && <View style={styles.separator} />}</View>;
          })}
        </Panel>}
        {!!editing && <Pressable accessibilityLabel="Eliminar perfil" onPress={onDelete} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color={theme.danger} /><Text style={styles.deleteButtonText}>ELIMINAR PERFIL</Text></Pressable>}
      </ScrollView>
      <View style={styles.modalFooter}><Pressable accessibilityLabel="Guardar perfil" onPress={onSave} style={({ pressed }) => [styles.primaryButton, styles.modalSaveButton, pressed && styles.pressed]}><Ionicons name="save-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>GUARDAR PERFIL</Text></Pressable></View>
    </SafeAreaView>
  </Modal>;
}

function ActivityLogModal({ visible, records, styles, theme, onClose }) {
  const [filter, setFilter] = useState("all");
  const categories = [
    { id: "all", label: "Todo" }, { id: "control", label: "Control" },
    { id: "circuit", label: "Circuitos" }, { id: "profile", label: "Perfiles" },
    { id: "security", label: "Seguridad" }, { id: "system", label: "Sistema" },
  ];
  const visibleRecords = records.filter((record) => filter === "all" || record.category === filter);
  const outcomeColor = (outcome) => outcome === "failed" || outcome === "blocked" ? theme.danger : outcome === "pending" ? theme.warning : theme.success;
  const categoryIcon = (category) => category === "control" ? "power-outline" : category === "circuit" ? "options-outline" : category === "profile" ? "person-outline" : category === "security" ? "shield-outline" : "hardware-chip-outline";
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}><Pressable accessibilityLabel="Cerrar historial" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>TRAZABILIDAD</Text><Text style={styles.modalTitle}>HISTORIAL DE ACTIVIDAD</Text></View><View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{records.length}</Text></View></View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
        <Panel style={styles.activityIntro} styles={styles}><Ionicons name="finger-print-outline" size={23} color={theme.accentBright} /><Text style={styles.permissionIntroText}>Cada registro indica qué ocurrió, qué perfil actuó y desde qué dispositivo. Los datos se sincronizan con el servidor cuando existe conexión.</Text></Panel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activityFilterRow}>{categories.map((item) => <Pressable key={item.id} accessibilityLabel={`Filtrar ${item.label}`} onPress={() => setFilter(item.id)} style={({ pressed }) => [styles.filterChip, filter === item.id && styles.filterChipActive, pressed && styles.pressed]}><Text style={[styles.filterChipText, filter === item.id && styles.filterChipTextActive]}>{item.label.toUpperCase()}</Text></Pressable>)}</ScrollView>
        {visibleRecords.length ? <View style={styles.activityList}>{visibleRecords.map((record) => <Panel key={record.id} style={styles.activityCard} styles={styles}><View style={[styles.activityIcon, { borderColor: outcomeColor(record.outcome) }]}><Ionicons name={categoryIcon(record.category)} size={20} color={outcomeColor(record.outcome)} /></View><View style={{ flex: 1 }}><View style={styles.activityTitleRow}><Text style={styles.activityTitle}>{record.action}</Text><Text style={[styles.activityOutcome, { color: outcomeColor(record.outcome) }]}>{record.outcome === "applied" ? "APLICADO" : record.outcome === "pending" ? "PENDIENTE" : record.outcome === "blocked" ? "BLOQUEADO" : "FALLÓ"}</Text></View><Text style={styles.activityMeta}>{record.profileName} · {record.device} · {dateTimeLabel(record.timestamp)}</Text>{!!record.detail && <Text style={styles.activityDetail}>{record.detail}</Text>}</View></Panel>)}</View> : <Panel style={styles.permissionEmptyPanel} styles={styles}><Ionicons name="time-outline" size={38} color={theme.muted} /><Text style={styles.permissionEmptyTitle}>SIN ACTIVIDAD</Text><Text style={styles.permissionEmptyText}>No existen registros para este filtro.</Text></Panel>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function NotificationCenterModal({ visible, notifications, styles, theme, onClose, onOpen }) {
  const colorFor = (severity) => severity === "critical" ? theme.danger : severity === "warning" ? theme.warning : theme.accentBright;
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}><Pressable accessibilityLabel="Cerrar notificaciones" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>CENTRO UNIFICADO</Text><Text style={styles.modalTitle}>NOTIFICACIONES</Text></View><View style={styles.permissionRequestCount}><Text style={styles.permissionRequestCountValue}>{notifications.length}</Text><Text style={styles.permissionRequestCountLabel}>AVISOS</Text></View></View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
        {notifications.length ? notifications.map((item) => <Pressable key={item.id} accessibilityLabel={item.title} onPress={() => onOpen(item)} style={({ pressed }) => [styles.panel, styles.notificationCard, pressed && styles.pressed]}><View style={[styles.notificationIcon, { backgroundColor: `${colorFor(item.severity)}16` }]}><Ionicons name={item.icon} size={23} color={colorFor(item.severity)} /></View><View style={{ flex: 1 }}><Text style={styles.notificationCategory}>{item.category.toUpperCase()}</Text><Text style={styles.notificationTitle}>{item.title}</Text><Text style={styles.notificationText}>{item.text}</Text></View><Ionicons name="chevron-forward" size={19} color={theme.muted} /></Pressable>) : <Panel style={styles.permissionEmptyPanel} styles={styles}><Ionicons name="checkmark-circle-outline" size={38} color={theme.success} /><Text style={styles.permissionEmptyTitle}>TODO AL DÍA</Text><Text style={styles.permissionEmptyText}>No hay avisos pendientes en este momento.</Text></Panel>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function ArchivedCircuitsModal({ visible, circuits, styles, theme, onClose, onRestore, onDelete }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}><Pressable accessibilityLabel="Cerrar archivo de circuitos" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>RECUPERACIÓN</Text><Text style={styles.modalTitle}>CIRCUITOS ARCHIVADOS</Text></View><View style={styles.stepBadge}><Text style={styles.stepBadgeText}>{circuits.length}</Text></View></View>
      <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator>
        <Panel style={styles.permissionIntroPanel} styles={styles}><Ionicons name="archive-outline" size={23} color={theme.accentBright} /><Text style={styles.permissionIntroText}>Archivar oculta un circuito sin perder sus datos técnicos. Al restaurarlo deberás revisar nuevamente horarios y permisos VoltKids.</Text></Panel>
        {circuits.length ? circuits.map((circuit) => <Panel key={`archived-${circuit.id}`} style={styles.archivedCircuitCard} styles={styles}><View style={styles.archivedCircuitTop}><View style={styles.circuitIcon}><Ionicons name={circuit.icon || "flash-outline"} size={21} color={theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.circuitName}>{circuit.name}</Text><Text style={styles.circuitMeta}>{circuit.room || "Sin habitación"} · {Number(circuit.power || 0).toLocaleString("es-CL")} W · {dateTimeLabel(circuit.archivedAt)}</Text></View></View><View style={styles.archivedCircuitActions}><Pressable feedback="confirm" accessibilityLabel={`Restaurar ${circuit.name}`} onPress={() => onRestore(circuit)} style={({ pressed }) => [styles.permissionApproveButton, pressed && styles.pressed]}><Ionicons name="refresh-outline" size={18} color={theme.onAccent} /><Text style={styles.permissionApproveText}>RESTAURAR</Text></Pressable><Pressable feedback="delete" accessibilityLabel={`Eliminar definitivamente ${circuit.name}`} onPress={() => onDelete(circuit)} style={({ pressed }) => [styles.permissionDenyButton, pressed && styles.pressed]}><Ionicons name="trash-outline" size={18} color={theme.danger} /><Text style={styles.permissionDenyText}>ELIMINAR</Text></Pressable></View></Panel>) : <Panel style={styles.permissionEmptyPanel} styles={styles}><Ionicons name="archive-outline" size={38} color={theme.muted} /><Text style={styles.permissionEmptyTitle}>ARCHIVO VACÍO</Text><Text style={styles.permissionEmptyText}>Los circuitos archivados aparecerán aquí para poder recuperarlos.</Text></Panel>}
      </ScrollView>
    </SafeAreaView>
  </Modal>;
}

function TutorialModal({ visible, step, styles, theme, onNext, onPrevious, onClose }) {
  const item = TUTORIAL_STEPS[Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, step))];
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.tutorialBackdrop}><View style={styles.tutorialCard}><Text style={styles.modalEyebrow}>GUÍA RÁPIDA · {step + 1}/{TUTORIAL_STEPS.length}</Text><View style={styles.tutorialIcon}><Ionicons name={item.icon} size={38} color={theme.accentBright} /></View><Text style={styles.tutorialTitle}>{item.title}</Text><Text style={styles.tutorialText}>{item.text}</Text><View style={styles.tutorialDots}>{TUTORIAL_STEPS.map((_, index) => <View key={`tutorial-dot-${index}`} style={[styles.tutorialDot, index === step && styles.tutorialDotActive]} />)}</View><View style={styles.tutorialActions}>{step > 0 && <Pressable accessibilityLabel="Paso anterior" onPress={onPrevious} style={({ pressed }) => [styles.pinCancel, pressed && styles.pressed]}><Text style={styles.pinCancelText}>ATRÁS</Text></Pressable>}<Pressable feedback="confirm" accessibilityLabel={step === TUTORIAL_STEPS.length - 1 ? "Finalizar guía" : "Siguiente paso"} onPress={step === TUTORIAL_STEPS.length - 1 ? onClose : onNext} style={({ pressed }) => [styles.pinConfirm, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{step === TUTORIAL_STEPS.length - 1 ? "COMENZAR" : "SIGUIENTE"}</Text></Pressable></View></View></View>
  </Modal>;
}

function MissionIntroModal({ visible, profileName, child, styles, theme, onStart, onSkip }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onSkip}>
    <View style={styles.tutorialBackdrop}><View style={styles.tutorialCard}>
      <Text style={styles.modalEyebrow}>INTRODUCCIÓN · SISTEMA DE LOGROS</Text>
      <View style={styles.tutorialIcon}><Ionicons name={child ? "happy-outline" : "trophy-outline"} size={38} color={theme.accentBright} /></View>
      <Text style={styles.tutorialTitle}>BIENVENIDO, {String(profileName || "USUARIO").toUpperCase()}</Text>
      <Text style={styles.tutorialText}>VoltKey puede enseñarte la aplicación mediante misiones. Comenzarás en el Perfil de información 3, con lo mínimo necesario; al completar logros pasarás al Perfil 2 y finalmente al Perfil 1.</Text>
      <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="options-outline" size={22} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>Puedes omitir esta ruta. Si lo haces, VoltKey mostrará toda la información y podrás volver a las misiones cuando quieras desde Ajustes → Tutorial.</Text></Panel>
      <View style={styles.tutorialActions}><Pressable accessibilityLabel="Omitir introducción" onPress={onSkip} style={({ pressed }) => [styles.pinCancel, pressed && styles.pressed]}><Text style={styles.pinCancelText}>OMITIR</Text></Pressable><Pressable feedback="confirm" accessibilityLabel="Comenzar misiones de introducción" onPress={onStart} style={({ pressed }) => [styles.pinConfirm, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>COMENZAR MISIONES</Text></Pressable></View>
    </View></View>
  </Modal>;
}

function BackupRestoreModal({ visible, value, styles, theme, onChange, onClose, onRestore, onFill }) {
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}><Pressable accessibilityLabel="Cerrar restauración" onPress={onClose} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable><View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>COPIA DE SEGURIDAD</Text><Text style={styles.modalTitle}>RESTAURAR CONFIGURACIÓN</Text></View></View>
      <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled"><Panel styles={styles}><SectionTitle title="DATOS DE RESPALDO" caption="Pega aquí el contenido de un respaldo JSON creado por VoltKey" icon="document-text-outline" styles={styles} theme={theme} /><TextInput value={value} onChangeText={onChange} multiline textAlignVertical="top" autoCapitalize="none" autoCorrect={false} placeholder="{ ... respaldo VoltKey ... }" placeholderTextColor={theme.muted} style={styles.backupTextInput} /><Pressable accessibilityLabel="Usar una copia de los datos actuales" onPress={onFill} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="copy-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>CARGAR DATOS ACTUALES</Text></Pressable></Panel><Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="warning-outline" size={22} color={theme.warning} /><Text style={styles.anomalySafetyText}>VoltKey valida el formato antes de reemplazar circuitos, perfiles, horarios y preferencias. Se conserva una copia local previa durante esta sesión.</Text></Panel></ScrollView>
      <View style={styles.modalFooter}><Pressable feedback="confirm" accessibilityLabel="Restaurar copia de seguridad" onPress={onRestore} style={({ pressed }) => [styles.primaryButton, styles.modalSaveButton, pressed && styles.pressed]}><Ionicons name="cloud-upload-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>VALIDAR Y RESTAURAR</Text></Pressable></View>
    </SafeAreaView>
  </Modal>;
}

function AlphaApp({ soundsEnabled, hapticsEnabled, onSoundsEnabledChange, onHapticsEnabledChange }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Orbitron_600SemiBold: require("@expo-google-fonts/orbitron/600SemiBold/Orbitron_600SemiBold.ttf"),
    Orbitron_700Bold: require("@expo-google-fonts/orbitron/700Bold/Orbitron_700Bold.ttf"),
    Rajdhani_500Medium: require("@expo-google-fonts/rajdhani/500Medium/Rajdhani_500Medium.ttf"),
    Rajdhani_600SemiBold: require("@expo-google-fonts/rajdhani/600SemiBold/Rajdhani_600SemiBold.ttf"),
    Rajdhani_700Bold: require("@expo-google-fonts/rajdhani/700Bold/Rajdhani_700Bold.ttf"),
    Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
    Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
    Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
    SpaceMono_400Regular: require("@expo-google-fonts/space-mono/400Regular/SpaceMono_400Regular.ttf"),
    SpaceMono_700Bold: require("@expo-google-fonts/space-mono/700Bold/SpaceMono_700Bold.ttf"),
  });

  const [showIntro, setShowIntro] = useState(true);
  const [screen, setScreen] = useState("inicio");
  const [paletteId, setPaletteId] = useState("alpha");
  const [kidsThemeId, setKidsThemeId] = useState("dark");
  const [fontId, setFontId] = useState("modern");
  const [userMode, setUserMode] = useState("home");
  const [layoutMode, setLayoutMode] = useState("auto");
  const [circuitViewMode, setCircuitViewMode] = useState("large");
  const [modeTransition, setModeTransition] = useState(null);
  const [kidsThemeTransition, setKidsThemeTransition] = useState(null);
  const [maintenanceChecks, setMaintenanceChecks] = useState({});
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [profiles, setProfiles] = useState(() => normalizeProfiles(DEFAULT_PROFILES));
  const [activeProfileId, setActiveProfileId] = useState("family-admin");
  const [profilesUpdatedAt, setProfilesUpdatedAt] = useState(null);
  const [profileSwitcherVisible, setProfileSwitcherVisible] = useState(false);
  const [profileFormVisible, setProfileFormVisible] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [profileForm, setProfileForm] = useState({ ...EMPTY_PROFILE_FORM, allowedCircuitIds: [] });
  const [pinRequest, setPinRequest] = useState(null);
  const [connection, setConnection] = useState(WS_URL ? "connecting" : "local");
  const [hardwareBridge, setHardwareBridge] = useState({ enabled: false, connected: false, device: "Arduino UNO R3", port: null, firmware: null, testVersion: null, serverRole: null, authority: "arduino-uno-r3", cardLedPin: 13, cardLedActiveLow: false, cardLedOutageBlinkMs: 1000, cardLedMode: "steady", cardLedOutput: true, cardCountdownSeconds: null, error: null });
  const [hardwarePrototype, setHardwarePrototype] = useState({ enabled: true, labels: ["General", "1er piso", "2do piso"], circuitIds: ["1", "2", "3"], relayPins: [12, 11, 10], activeLowMask: 0, cardLed: { ...DEFAULT_CARD_LED_CONFIG }, lastEvent: null, lastSelfTest: null });
  const [cardInserted, setCardInserted] = useState(true);
  const [shutdownSeconds, setShutdownSeconds] = useState(null);
  const [circuits, setCircuits] = useState(INITIAL_CIRCUITS);
  const [archivedCircuits, setArchivedCircuits] = useState([]);
  const [archivedCircuitsUpdatedAt, setArchivedCircuitsUpdatedAt] = useState(null);
  const [archivedCircuitsVisible, setArchivedCircuitsVisible] = useState(false);
  const [circuitCatalogUpdatedAt, setCircuitCatalogUpdatedAt] = useState(null);
  const [circuitModalVisible, setCircuitModalVisible] = useState(false);
  const [editingCircuitId, setEditingCircuitId] = useState(null);
  const [circuitForm, setCircuitForm] = useState(EMPTY_CIRCUIT_FORM);
  const [metricModalId, setMetricModalId] = useState(null);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduleForm, setScheduleForm] = useState(() => defaultSchedule(INITIAL_CIRCUITS));
  const [schedules, setSchedules] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("1m");
  const [historyRecords, setHistoryRecords] = useState(() => buildDemoHistory(365));
  const [historySource, setHistorySource] = useState("simulation");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [serverAnomalies, setServerAnomalies] = useState([]);
  const [anomalyReviews, setAnomalyReviews] = useState({});
  const [anomalyReviewsUpdatedAt, setAnomalyReviewsUpdatedAt] = useState(null);
  const [anomalyPowerThreshold, setAnomalyPowerThreshold] = useState(DEFAULT_ANOMALY_POWER_THRESHOLD);
  const [anomalyThresholdInput, setAnomalyThresholdInput] = useState(String(DEFAULT_ANOMALY_POWER_THRESHOLD));
  const [anomalySettingsUpdatedAt, setAnomalySettingsUpdatedAt] = useState(null);
  const [anomalyFolder, setAnomalyFolder] = useState("active");
  const [anomalyMetricFilter, setAnomalyMetricFilter] = useState("all");
  const [anomalyStatusFilter, setAnomalyStatusFilter] = useState("all");
  const [anomalyCenterVisible, setAnomalyCenterVisible] = useState(false);
  const [selectedAnomaly, setSelectedAnomaly] = useState(null);
  const [permissionRequests, setPermissionRequests] = useState([]);
  const [permissionRequestsUpdatedAt, setPermissionRequestsUpdatedAt] = useState(null);
  const [permissionCenterVisible, setPermissionCenterVisible] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [activityLogUpdatedAt, setActivityLogUpdatedAt] = useState(null);
  const [activityLogVisible, setActivityLogVisible] = useState(false);
  const [circuitDiagnostics, setCircuitDiagnostics] = useState({});
  const [notificationCenterVisible, setNotificationCenterVisible] = useState(false);
  const [circuitSearch, setCircuitSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [kidsMissions, setKidsMissions] = useState({});
  const [kidsMissionsUpdatedAt, setKidsMissionsUpdatedAt] = useState(null);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialNeeded, setTutorialNeeded] = useState(false);
  const [tutorialTabVisible, setTutorialTabVisible] = useState(true);
  const [missionIntroVisible, setMissionIntroVisible] = useState(false);
  const [introProgress, setIntroProgress] = useState({});
  const [informationProfiles, setInformationProfiles] = useState({});
  const [infoSettingsTab, setInfoSettingsTab] = useState("inicio");
  const [backupRestoreVisible, setBackupRestoreVisible] = useState(false);
  const [backupRestoreText, setBackupRestoreText] = useState("");
  const [technicalSession, setTechnicalSession] = useState(null);
  const [technicalClock, setTechnicalClock] = useState(Date.now());
  const [connectedClients, setConnectedClients] = useState([]);
  const [latency, setLatency] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [voltage, setVoltage] = useState(220);
  const [tariff, setTariff] = useState(TARIFF_CLP);
  const [tariffMeta, setTariffMeta] = useState(DEFAULT_TARIFF_META);
  const [tariffRefreshing, setTariffRefreshing] = useState(false);
  const [power, setPower] = useState(1550);
  const [energy, setEnergy] = useState(186.42);
  const [gridAvailable, setGridAvailable] = useState(true);
  const [battery, setBattery] = useState(87);
  const [batteryHealth, setBatteryHealth] = useState(94);
  const [batteryCycles, setBatteryCycles] = useState(126);
  const [batteryTemperature, setBatteryTemperature] = useState(27);
  const [kidsCircuitAction, setKidsCircuitAction] = useState(null);
  const [eventMessage, setEventMessage] = useState("Sistema iniciado correctamente");
  const socketRef = useRef(null);
  const restoreIdsRef = useRef([]);
  const lastHistorySampleRef = useRef(0);
  const lastTariffNotificationRef = useRef("");
  const reconnectRef = useRef(() => {});
  const circuitsRef = useRef(circuits);
  const archivedCircuitsRef = useRef(archivedCircuits);
  const archivedCircuitsUpdatedAtRef = useRef(archivedCircuitsUpdatedAt);
  const circuitCatalogUpdatedAtRef = useRef(circuitCatalogUpdatedAt);
  const pendingCircuitCommandsRef = useRef({});
  const schedulePhasesRef = useRef({});
  const schedulesRef = useRef(schedules);
  const selectedPeriodRef = useRef(selectedPeriod);
  const tariffRef = useRef(tariff);
  const transitionTimersRef = useRef([]);
  const kidsTransitionTimersRef = useRef([]);
  const profilesRef = useRef(profiles);
  const profilesUpdatedAtRef = useRef(profilesUpdatedAt);
  const activeProfileIdRef = useRef(activeProfileId);
  const technicalProfileRef = useRef(null);
  const permissionRequestsRef = useRef(permissionRequests);
  const permissionRequestsUpdatedAtRef = useRef(permissionRequestsUpdatedAt);
  const permissionNotificationsInitializedRef = useRef(false);
  const anomalyScrollPositionRef = useRef(0);
  const anomalyReviewsRef = useRef(anomalyReviews);
  const anomalyReviewsUpdatedAtRef = useRef(anomalyReviewsUpdatedAt);
  const anomalyPowerThresholdRef = useRef(anomalyPowerThreshold);
  const anomalySettingsUpdatedAtRef = useRef(anomalySettingsUpdatedAt);
  const activityLogRef = useRef(activityLog);
  const activityLogUpdatedAtRef = useRef(activityLogUpdatedAt);
  const kidsMissionsRef = useRef(kidsMissions);
  const kidsMissionsUpdatedAtRef = useRef(kidsMissionsUpdatedAt);
  const preRestoreBackupRef = useRef(null);

  circuitsRef.current = circuits;
  archivedCircuitsRef.current = archivedCircuits;
  archivedCircuitsUpdatedAtRef.current = archivedCircuitsUpdatedAt;
  circuitCatalogUpdatedAtRef.current = circuitCatalogUpdatedAt;
  schedulesRef.current = schedules;
  selectedPeriodRef.current = selectedPeriod;
  tariffRef.current = tariff;
  profilesRef.current = profiles;
  profilesUpdatedAtRef.current = profilesUpdatedAt;
  activeProfileIdRef.current = activeProfileId;
  permissionRequestsRef.current = permissionRequests;
  permissionRequestsUpdatedAtRef.current = permissionRequestsUpdatedAt;
  anomalyReviewsRef.current = anomalyReviews;
  anomalyReviewsUpdatedAtRef.current = anomalyReviewsUpdatedAt;
  anomalyPowerThresholdRef.current = anomalyPowerThreshold;
  anomalySettingsUpdatedAtRef.current = anomalySettingsUpdatedAt;
  activityLogRef.current = activityLog;
  activityLogUpdatedAtRef.current = activityLogUpdatedAt;
  kidsMissionsRef.current = kidsMissions;
  kidsMissionsUpdatedAtRef.current = kidsMissionsUpdatedAt;

  const isDesktopLayout = layoutMode === "desktop" || (layoutMode === "auto" && Platform.OS === "web" && width >= 900);
  const selectedProfile = profiles.find((profile) => profile.id === activeProfileId)
    || profiles.find((profile) => profile.role === "normal") || profiles[0] || DEFAULT_PROFILES[0];
  const activeProfile = userMode === "technical" && technicalProfileRef.current
    ? technicalProfileRef.current
    : selectedProfile;
  const isChildProfile = activeProfile.role === "child";
  const currentInformationSetting = informationProfiles[activeProfile.id] || { preset: "3", modules: informationModulesForPreset("3"), updatedAt: null };
  const currentInformationPreset = ["1", "2", "3"].includes(currentInformationSetting.preset) ? currentInformationSetting.preset : "1";
  const showInformationModule = (moduleId) => userMode === "technical" || currentInformationSetting.modules?.[moduleId] !== false;
  const cardLedConfig = { ...DEFAULT_CARD_LED_CONFIG, ...(hardwarePrototype.cardLed || {}) };
  const hardwareFirmwareReady = hardwareBridge.connected && hardwareBridge.firmware === APP_VERSION && hardwareBridge.testVersion === ARDUINO_TEST_VERSION;
  const inferredCardLedMode = cardInserted ? (gridAvailable ? "steady" : "outage_blink") : shutdownSeconds !== null ? "countdown_blink" : "off";
  const cardLedMode = hardwareFirmwareReady ? (hardwareBridge.cardLedMode || cardLedConfig.mode || inferredCardLedMode) : inferredCardLedMode;
  const cardLedStatusText = cardLedModeText(cardLedMode, cardLedConfig.outageBlinkMs);
  const allowedCircuitIds = useMemo(() => {
    const ids = new Set((activeProfile.allowedCircuitIds || []).map(String));
    if (activeProfile.role === "child") permissionRequests.forEach((request) => {
      if (permissionGrantIsActive(request, activeProfile.id, request.circuitId)) ids.add(String(request.circuitId));
    });
    return ids;
  }, [activeProfile.allowedCircuitIds, activeProfile.id, activeProfile.role, permissionRequests]);
  const profileCircuits = useMemo(() => isChildProfile
    ? circuits.filter((circuit) => allowedCircuitIds.has(String(circuit.id)))
    : circuits, [allowedCircuitIds, circuits, isChildProfile]);
  const roomOptions = useMemo(() => [...new Set(circuits.map((circuit) => String(circuit.room || "Sin habitación").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [circuits]);
  const visibleProfileCircuits = useMemo(() => {
    const query = circuitSearch.trim().toLocaleLowerCase("es");
    return profileCircuits.filter((circuit) => {
      const roomMatches = roomFilter === "all" || String(circuit.room || "Sin habitación") === roomFilter;
      const queryMatches = !query || `${circuit.name} ${circuit.room || ""} ${circuit.brand || ""} ${circuit.model || ""}`.toLocaleLowerCase("es").includes(query);
      return roomMatches && queryMatches;
    });
  }, [circuitSearch, profileCircuits, roomFilter]);
  const normalTheme = PALETTES[paletteId] || PALETTES.alpha;
  const kidsTheme = KIDS_PALETTES[kidsThemeId] || KIDS_PALETTES.dark;
  const theme = userMode === "technical" ? TECHNICAL_PALETTE : isChildProfile ? kidsTheme : normalTheme;
  const font = isChildProfile && kidsThemeId === "hacker" ? FONT_PRESETS.terminal : FONT_PRESETS[fontId] || FONT_PRESETS.modern;
  const styles = useMemo(() => createStyles(theme, font, width, height, isDesktopLayout), [theme, font, width, height, isDesktopLayout]);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.multiGet([
      "voltkey.palette", "voltkey.kidsTheme", "voltkey.kidsThemePolicyVersion", "voltkey.font", "voltkey.userMode", "voltkey.layoutMode", "voltkey.circuitViewMode", "voltkey.maintenanceChecks", "voltkey.controlPolicyVersion",
      "voltkey.circuits", "voltkey.circuitCatalogVersion", "voltkey.circuitCatalogUpdatedAt", "voltkey.schedules", "voltkey.schedulePhases", "voltkey.lastTariffNotification", "voltkey.profiles", "voltkey.activeProfileId", "voltkey.profilesUpdatedAt",
      "voltkey.anomalyReviews", "voltkey.anomalyReviewsUpdatedAt", "voltkey.anomalyPowerThreshold", "voltkey.anomalySettingsUpdatedAt",
      "voltkey.permissionRequests", "voltkey.permissionRequestsUpdatedAt",
      "voltkey.archivedCircuits", "voltkey.archivedCircuitsUpdatedAt", "voltkey.activityLog", "voltkey.activityLogUpdatedAt",
      "voltkey.kidsMissions", "voltkey.kidsMissionsUpdatedAt", "voltkey.circuitDiagnostics", "voltkey.onboarding111Completed", "voltkey.onboardingArduinoTest11Completed", "voltkey.onboardingArduinoTest12Completed", "voltkey.technicalSession",
      "voltkey.arduinoTestEdition", "voltkey.tutorialTabVisible", "voltkey.onboarding210Completed", "voltkey.introMissionProgress", "voltkey.informationProfiles",
      "alpha.palette", "alpha.font", "alpha.userMode", "alpha.layoutMode", "alpha.maintenanceChecks",
      "alpha.circuits", "alpha.schedules", "alpha.lastTariffNotification",
    ]).then((entries) => {
      if (!mounted) return;
      const values = Object.fromEntries(entries);
      const stored = (key) => values[`voltkey.${key}`] ?? values[`alpha.${key}`];
      const migrateAutomaticLocks = values["voltkey.controlPolicyVersion"] !== "explicit-lock-v1";
      const migrateKidsThemeDefault = values["voltkey.kidsThemePolicyVersion"] !== "pulse-dark-v1";
      const migrateEditableCircuitCatalog = values["voltkey.circuitCatalogVersion"] !== "editable-v2";
      const storedArduinoTestVersion = String(values["voltkey.arduinoTestEdition"] || "");
      const migrateArduinoTest = !["1.0", "1.1", ARDUINO_TEST_VERSION].includes(storedArduinoTestVersion);
      const upgradeArduinoTest = ["1.0", "1.1"].includes(storedArduinoTestVersion);
      if (stored("palette") && PALETTES[stored("palette")]) setPaletteId(stored("palette"));
      if (migrateKidsThemeDefault && (!stored("kidsTheme") || stored("kidsTheme") === "light")) setKidsThemeId("dark");
      else if (stored("kidsTheme") && KIDS_PALETTES[stored("kidsTheme")]) setKidsThemeId(stored("kidsTheme"));
      if (stored("font") && FONT_PRESETS[stored("font")]) setFontId(stored("font"));
      if (["home", "technical"].includes(stored("userMode"))) setUserMode(stored("userMode"));
      if (["auto", "mobile", "desktop"].includes(stored("layoutMode"))) setLayoutMode(stored("layoutMode"));
      if (["detail", "large"].includes(stored("circuitViewMode"))) setCircuitViewMode(stored("circuitViewMode"));
      setTutorialTabVisible(values["voltkey.tutorialTabVisible"] !== "0");
      if (values["voltkey.introMissionProgress"]) {
        try { setIntroProgress(normalizeIntroProgress(JSON.parse(values["voltkey.introMissionProgress"]))); }
        catch { setIntroProgress({}); }
      }
      if (values["voltkey.informationProfiles"]) {
        try { setInformationProfiles(normalizeInformationProfiles(JSON.parse(values["voltkey.informationProfiles"]))); }
        catch { setInformationProfiles({}); }
      }
      if (stored("maintenanceChecks")) {
        try {
          const storedChecks = JSON.parse(stored("maintenanceChecks"));
          if (storedChecks && typeof storedChecks === "object" && !Array.isArray(storedChecks)) setMaintenanceChecks(storedChecks);
        } catch { /* Conserva el registro de mantenimiento vacío. */ }
      }
      if (stored("lastTariffNotification")) lastTariffNotificationRef.current = stored("lastTariffNotification");
      if (stored("profiles")) {
        try {
          const restoredProfiles = normalizeProfiles(JSON.parse(stored("profiles")));
          setProfiles(migrateArduinoTest ? restoredProfiles.map((profile) => profile.role === "child" ? { ...profile, allowedCircuitIds: [2, 3] } : profile) : restoredProfiles);
        }
        catch { /* Conserva los perfiles familiares iniciales. */ }
      }
      if (stored("activeProfileId")) setActiveProfileId(stored("activeProfileId"));
      if (stored("profilesUpdatedAt")) setProfilesUpdatedAt(stored("profilesUpdatedAt"));
      if (stored("anomalyReviews")) {
        try { setAnomalyReviews(normalizeAnomalyReviews(JSON.parse(stored("anomalyReviews")))); }
        catch { /* Conserva el seguimiento de anomalías vacío. */ }
      }
      if (stored("anomalyReviewsUpdatedAt")) setAnomalyReviewsUpdatedAt(stored("anomalyReviewsUpdatedAt"));
      const storedPowerThreshold = Number(stored("anomalyPowerThreshold"));
      if (Number.isFinite(storedPowerThreshold) && storedPowerThreshold >= MIN_ANOMALY_POWER_THRESHOLD && storedPowerThreshold <= MAX_ANOMALY_POWER_THRESHOLD) {
        setAnomalyPowerThreshold(storedPowerThreshold);
        setAnomalyThresholdInput(String(storedPowerThreshold));
      }
      if (stored("anomalySettingsUpdatedAt")) setAnomalySettingsUpdatedAt(stored("anomalySettingsUpdatedAt"));
      if (stored("permissionRequests")) {
        try { setPermissionRequests(normalizePermissionRequests(JSON.parse(stored("permissionRequests")))); }
        catch { /* Conserva una bandeja de solicitudes vacía. */ }
      }
      if (stored("permissionRequestsUpdatedAt")) setPermissionRequestsUpdatedAt(stored("permissionRequestsUpdatedAt"));
      if (!migrateArduinoTest && stored("archivedCircuits")) {
        try { setArchivedCircuits(normalizeArchivedCircuits(JSON.parse(stored("archivedCircuits")))); }
        catch { /* Conserva el archivo de circuitos vacío. */ }
      }
      if (stored("archivedCircuitsUpdatedAt")) setArchivedCircuitsUpdatedAt(stored("archivedCircuitsUpdatedAt"));
      if (stored("activityLog")) {
        try { setActivityLog(normalizeActivityLog(JSON.parse(stored("activityLog")))); }
        catch { /* Conserva el historial de actividad vacío. */ }
      }
      if (stored("activityLogUpdatedAt")) setActivityLogUpdatedAt(stored("activityLogUpdatedAt"));
      if (stored("kidsMissions")) {
        try { setKidsMissions(normalizeKidsMissions(JSON.parse(stored("kidsMissions")))); }
        catch { /* Conserva las misiones ecológicas vacías. */ }
      }
      if (stored("kidsMissionsUpdatedAt")) setKidsMissionsUpdatedAt(stored("kidsMissionsUpdatedAt"));
      if (stored("circuitDiagnostics")) {
        try {
          const diagnostics = JSON.parse(stored("circuitDiagnostics"));
          if (diagnostics && typeof diagnostics === "object" && !Array.isArray(diagnostics)) setCircuitDiagnostics(diagnostics);
        } catch { /* Conserva el diagnóstico vacío. */ }
      }
      if (stored("technicalSession")) {
        try {
          const session = JSON.parse(stored("technicalSession"));
          if (session && typeof session === "object") setTechnicalSession(session);
        } catch { /* Crea una sesión nueva al entrar. */ }
      }
      setTutorialNeeded(values["voltkey.onboarding210Completed"] !== "1");
      if (stored("circuitCatalogUpdatedAt")) setCircuitCatalogUpdatedAt(stored("circuitCatalogUpdatedAt"));
      if (migrateArduinoTest) {
        setCircuits(INITIAL_CIRCUITS.map(normalizeCircuitControl));
        setArchivedCircuits([]);
        setSchedules([]);
        schedulePhasesRef.current = {};
        setCircuitCatalogUpdatedAt(new Date().toISOString());
        AsyncStorage.setItem("voltkey.arduinoTestEdition", ARDUINO_TEST_VERSION).catch(() => {});
      } else if (stored("circuits")) {
        try {
          const storedCircuits = JSON.parse(stored("circuits"));
          if (Array.isArray(storedCircuits)) {
            const normalizedCircuits = normalizeArduinoTestCircuits(storedCircuits);
            setCircuits(migrateAutomaticLocks ? normalizedCircuits.map((circuit) => ({
              ...circuit,
              adminLocked: false,
              adminDecisionAt: null,
              adminProfileId: null,
              controlUpdatedAt: null,
            })) : normalizedCircuits);
          }
        } catch { /* Conserva la configuración segura inicial. */ }
      }
      if (!migrateArduinoTest && stored("schedules")) {
        try {
          const storedSchedules = JSON.parse(stored("schedules"));
          if (Array.isArray(storedSchedules)) setSchedules(storedSchedules);
        } catch { /* Conserva una lista vacía. */ }
      }
      if (!migrateArduinoTest && stored("schedulePhases")) {
        try {
          const storedPhases = JSON.parse(stored("schedulePhases"));
          if (storedPhases && typeof storedPhases === "object" && !Array.isArray(storedPhases)) {
            schedulePhasesRef.current = Object.fromEntries(Object.entries(storedPhases).map(([key, value]) => [String(key), Boolean(value)]));
          }
        } catch { schedulePhasesRef.current = {}; }
      }
      if (upgradeArduinoTest) AsyncStorage.setItem("voltkey.arduinoTestEdition", ARDUINO_TEST_VERSION).catch(() => {});
      setPreferencesLoaded(true);
    }).catch(() => setPreferencesLoaded(true));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!fontsLoaded || !preferencesLoaded) return undefined;
    const timer = setTimeout(() => setShowIntro(false), 2600);
    return () => clearTimeout(timer);
  }, [fontsLoaded, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.circuits", JSON.stringify(circuits)],
      ["voltkey.circuitCatalogVersion", "editable-v2"],
      ["voltkey.circuitCatalogUpdatedAt", circuitCatalogUpdatedAt || ""],
    ]).catch(() => {});
  }, [circuitCatalogUpdatedAt, circuits, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.setItem("voltkey.schedules", JSON.stringify(schedules)).catch(() => {});
  }, [schedules, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.userMode", userMode],
      ["voltkey.layoutMode", layoutMode],
      ["voltkey.circuitViewMode", circuitViewMode],
      ["voltkey.maintenanceChecks", JSON.stringify(maintenanceChecks)],
      ["voltkey.controlPolicyVersion", "explicit-lock-v1"],
    ]).catch(() => {});
  }, [circuitViewMode, layoutMode, maintenanceChecks, preferencesLoaded, userMode]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.setItem("voltkey.tutorialTabVisible", tutorialTabVisible ? "1" : "0").catch(() => {});
    if (!tutorialTabVisible && screen === "tutorial") setScreen("ajustes");
  }, [preferencesLoaded, screen, tutorialTabVisible]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.introMissionProgress", JSON.stringify(introProgress)],
      ["voltkey.informationProfiles", JSON.stringify(informationProfiles)],
    ]).catch(() => {});
  }, [informationProfiles, introProgress, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.profiles", JSON.stringify(profiles)],
      ["voltkey.activeProfileId", activeProfileId],
      ["voltkey.profilesUpdatedAt", profilesUpdatedAt || ""],
    ]).catch(() => {});
  }, [activeProfileId, preferencesLoaded, profiles, profilesUpdatedAt]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.anomalyReviews", JSON.stringify(anomalyReviews)],
      ["voltkey.anomalyReviewsUpdatedAt", anomalyReviewsUpdatedAt || ""],
    ]).catch(() => {});
  }, [anomalyReviews, anomalyReviewsUpdatedAt, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.kidsTheme", kidsThemeId],
      ["voltkey.kidsThemePolicyVersion", "pulse-dark-v1"],
      ["voltkey.anomalyPowerThreshold", String(anomalyPowerThreshold)],
      ["voltkey.anomalySettingsUpdatedAt", anomalySettingsUpdatedAt || ""],
    ]).catch(() => {});
  }, [anomalyPowerThreshold, anomalySettingsUpdatedAt, kidsThemeId, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.permissionRequests", JSON.stringify(permissionRequests)],
      ["voltkey.permissionRequestsUpdatedAt", permissionRequestsUpdatedAt || ""],
    ]).catch(() => {});
  }, [permissionRequests, permissionRequestsUpdatedAt, preferencesLoaded]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    AsyncStorage.multiSet([
      ["voltkey.archivedCircuits", JSON.stringify(archivedCircuits)],
      ["voltkey.archivedCircuitsUpdatedAt", archivedCircuitsUpdatedAt || ""],
      ["voltkey.activityLog", JSON.stringify(activityLog)],
      ["voltkey.activityLogUpdatedAt", activityLogUpdatedAt || ""],
      ["voltkey.kidsMissions", JSON.stringify(kidsMissions)],
      ["voltkey.kidsMissionsUpdatedAt", kidsMissionsUpdatedAt || ""],
      ["voltkey.circuitDiagnostics", JSON.stringify(circuitDiagnostics)],
      ["voltkey.technicalSession", technicalSession ? JSON.stringify(technicalSession) : ""],
    ]).catch(() => {});
  }, [activityLog, activityLogUpdatedAt, archivedCircuits, archivedCircuitsUpdatedAt, circuitDiagnostics, kidsMissions, kidsMissionsUpdatedAt, preferencesLoaded, technicalSession]);

  useEffect(() => {
    if (!preferencesLoaded || showIntro || userMode === "technical" || missionIntroVisible) return;
    if (!tutorialNeeded && introProgress[activeProfile.id]) return;
    setMissionIntroVisible(true);
    setTutorialNeeded(false);
  }, [activeProfile.id, introProgress, missionIntroVisible, preferencesLoaded, showIntro, tutorialNeeded, userMode]);

  useEffect(() => {
    if (userMode !== "technical" || !technicalSession?.startedAt || technicalSession.status !== "active") return undefined;
    const timer = setInterval(() => setTechnicalClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [technicalSession?.startedAt, technicalSession?.status, userMode]);

  useEffect(() => {
    if (!preferencesLoaded || userMode === "technical" || profiles.some((profile) => profile.id === activeProfileId)) return;
    setActiveProfileId(profiles.find((profile) => profile.role === "normal")?.id || profiles[0]?.id || "family-admin");
  }, [activeProfileId, preferencesLoaded, profiles, userMode]);

  useEffect(() => () => {
    transitionTimersRef.current.forEach((timer) => clearTimeout(timer));
    kidsTransitionTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (screen === "tecnico") setScreen("inicio");
  }, [screen]);

  useEffect(() => {
    if (!isChildProfile) return;
    if (userMode !== "home") setUserMode("home");
    const allowedScreens = ["inicio", "circuitos", "ajustes", ...(tutorialTabVisible ? ["tutorial"] : [])];
    if (!allowedScreens.includes(screen)) setScreen("inicio");
  }, [isChildProfile, screen, tutorialTabVisible, userMode]);

  useEffect(() => {
    if (isChildProfile || userMode !== "home") return;
    const allowedScreens = currentInformationSetting.preset === "custom" || currentInformationPreset === "1"
      ? ["inicio", "circuitos", "energia", "respaldo", "ajustes"]
      : currentInformationPreset === "2" ? ["inicio", "circuitos", "respaldo", "ajustes"] : ["inicio", "circuitos", "ajustes"];
    if (screen !== "tutorial" && !allowedScreens.includes(screen)) setScreen("inicio");
  }, [currentInformationPreset, currentInformationSetting.preset, isChildProfile, screen, userMode]);

  useEffect(() => {
    if (userMode !== "technical") {
      technicalProfileRef.current = null;
      return;
    }
    if (!technicalProfileRef.current) technicalProfileRef.current = selectedProfile;
    setProfileSwitcherVisible(false);
    setPermissionCenterVisible(false);
    setNotificationCenterVisible(false);
    setArchivedCircuitsVisible(false);
    setBackupRestoreVisible(false);
    setProfileFormVisible(false);
    setEditingProfileId(null);
    setProfileForm({ ...EMPTY_PROFILE_FORM, allowedCircuitIds: [] });
    setPinRequest(null);
  }, [userMode]);

  useEffect(() => {
    if (isChildProfile) return;
    kidsTransitionTimersRef.current.forEach((timer) => clearTimeout(timer));
    kidsTransitionTimersRef.current = [];
    setKidsThemeTransition(null);
  }, [isChildProfile]);

  useEffect(() => {
    if (!WS_URL || !preferencesLoaded) return undefined;
    let alive = true;
    let appState = AppState.currentState || "active";
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let watchdogTimer = null;
    let reconnectAttempts = 0;
    let connectionGeneration = 0;
    let lastMessageAt = Date.now();

    const clearReconnectTimer = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const clearLiveTimers = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (watchdogTimer) clearInterval(watchdogTimer);
      heartbeatTimer = null;
      watchdogTimer = null;
    };

    const closeCurrentSocket = () => {
      const current = socketRef.current;
      if (!current) return;
      socketRef.current = null;
      current.onopen = null;
      current.onmessage = null;
      current.onerror = null;
      current.onclose = null;
      try { current.close(); } catch { /* La conexión ya estaba cerrada. */ }
    };

    const scheduleReconnect = () => {
      if (!alive || appState !== "active") return;
      clearReconnectTimer();
      const delay = Math.min(15000, 1000 * (2 ** Math.min(reconnectAttempts, 4)));
      reconnectAttempts += 1;
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    const connect = (force = false) => {
      if (!alive || appState !== "active") return;
      const current = socketRef.current;
      if (!force && current && [WebSocket.OPEN, WebSocket.CONNECTING].includes(current.readyState)) return;

      clearReconnectTimer();
      clearLiveTimers();
      connectionGeneration += 1;
      const generation = connectionGeneration;
      closeCurrentSocket();
      setConnection("connecting");
      const socket = new WebSocket(websocketUrl());
      socketRef.current = socket;
      lastMessageAt = Date.now();

      socket.onopen = () => {
        if (!alive || generation !== connectionGeneration || socketRef.current !== socket) return;
        reconnectAttempts = 0;
        lastMessageAt = Date.now();
        setConnection("online");
        setLastSyncAt(new Date().toISOString());
        setEventMessage("Conexión con el servidor restablecida");
        socket.send(JSON.stringify({ type: "register_client", platform: Platform.OS, name: Platform.OS === "web" ? "Computador" : "Celular", source: CLIENT_ID, version: APP_VERSION, edition: EDITION_ID }));
        socket.send(JSON.stringify({ type: "request_state", source: CLIENT_ID, version: APP_VERSION, edition: EDITION_ID }));
        socket.send(JSON.stringify({ type: "request_history", period: selectedPeriodRef.current, source: CLIENT_ID, edition: EDITION_ID }));
        socket.send(JSON.stringify({
          type: "merge_local",
          circuits: circuitsRef.current.filter((circuit) => circuit.custom),
          circuitCatalog: circuitsRef.current,
          circuitCatalogUpdatedAt: circuitCatalogUpdatedAtRef.current,
          circuitControls: circuitsRef.current.map((circuit) => ({
            id: circuit.id,
            on: Boolean(circuit.on),
            adminLocked: Boolean(circuit.adminLocked),
            adminDecisionAt: circuit.adminDecisionAt || null,
            adminProfileId: circuit.adminProfileId || null,
            controlUpdatedAt: circuit.controlUpdatedAt || null,
            lastControlCommandId: circuit.lastControlCommandId || null,
          })),
          schedules: schedulesRef.current,
          profiles: profilesRef.current,
          profilesUpdatedAt: profilesUpdatedAtRef.current,
          anomalyReviews: anomalyReviewsRef.current,
          anomalyReviewsUpdatedAt: anomalyReviewsUpdatedAtRef.current,
          anomalyPowerThreshold: anomalyPowerThresholdRef.current,
          anomalySettingsUpdatedAt: anomalySettingsUpdatedAtRef.current,
          permissionRequests: permissionRequestsRef.current,
          permissionRequestsUpdatedAt: permissionRequestsUpdatedAtRef.current,
          archivedCircuits: archivedCircuitsRef.current,
          archivedCircuitsUpdatedAt: archivedCircuitsUpdatedAtRef.current,
          activityLog: activityLogRef.current,
          activityLogUpdatedAt: activityLogUpdatedAtRef.current,
          kidsMissions: kidsMissionsRef.current,
          kidsMissionsUpdatedAt: kidsMissionsUpdatedAtRef.current,
          profileId: activeProfileIdRef.current,
          source: CLIENT_ID,
          edition: EDITION_ID,
        }));
        heartbeatTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping", sentAt: Date.now(), source: CLIENT_ID, edition: EDITION_ID }));
        }, 5000);
        watchdogTimer = setInterval(() => {
          if (socketRef.current !== socket || socket.readyState !== WebSocket.OPEN) return;
          if (Date.now() - lastMessageAt > 18000) {
            setEventMessage("La conexión dejó de responder; reconectando…");
            try { socket.close(); } catch { scheduleReconnect(); }
          }
        }, 5000);
      };
      socket.onmessage = (event) => {
        if (!alive || generation !== connectionGeneration || socketRef.current !== socket) return;
        lastMessageAt = Date.now();
        try {
          const message = JSON.parse(event.data);
          setLastSyncAt(message.serverTime || new Date().toISOString());
          if (Array.isArray(message.circuits)) {
            const remoteCircuits = normalizeArduinoTestCircuits(message.circuits);
            const remoteCatalogAt = message.circuitCatalogUpdatedAt ? String(message.circuitCatalogUpdatedAt) : null;
            const localCatalogAt = circuitCatalogUpdatedAtRef.current;
            const parsedRemoteCatalogAt = Date.parse(remoteCatalogAt || "");
            const parsedLocalCatalogAt = Date.parse(localCatalogAt || "");
            const remoteCatalogIsCurrent = !localCatalogAt || Boolean(remoteCatalogAt && (
              (Number.isFinite(parsedRemoteCatalogAt) && Number.isFinite(parsedLocalCatalogAt))
                ? parsedRemoteCatalogAt >= parsedLocalCatalogAt
                : remoteCatalogAt >= localCatalogAt
            ));
            setCircuits((currentCircuits) => {
              const currentById = new Map(currentCircuits.map((circuit) => [String(circuit.id), circuit]));
              const remoteById = new Map(remoteCircuits.map((circuit) => [String(circuit.id), circuit]));
              const definitions = remoteCatalogIsCurrent ? remoteCircuits : currentCircuits;
              return definitions.map((definition) => {
                const key = String(definition.id);
                const localCircuit = currentById.get(key);
                const remoteCircuit = remoteById.get(key);
                let nextCircuit = definition;
                if (!remoteCatalogIsCurrent && remoteCircuit) {
                  const remoteControlAt = Date.parse(remoteCircuit.controlUpdatedAt || "");
                  const localControlAt = Date.parse(localCircuit?.controlUpdatedAt || "");
                  const remoteControlIsCurrent = !localCircuit?.controlUpdatedAt || Boolean(remoteCircuit.controlUpdatedAt && (
                    (Number.isFinite(remoteControlAt) && Number.isFinite(localControlAt))
                      ? remoteControlAt >= localControlAt
                      : String(remoteCircuit.controlUpdatedAt) >= String(localCircuit.controlUpdatedAt)
                  ));
                  if (remoteControlIsCurrent) {
                    nextCircuit = {
                      ...definition,
                      on: Boolean(remoteCircuit.on),
                      adminLocked: Boolean(remoteCircuit.adminLocked),
                      adminDecisionAt: remoteCircuit.adminDecisionAt || null,
                      adminProfileId: remoteCircuit.adminProfileId || null,
                      controlUpdatedAt: remoteCircuit.controlUpdatedAt || null,
                      lastControlCommandId: remoteCircuit.lastControlCommandId || null,
                    };
                  }
                }
                const pending = pendingCircuitCommandsRef.current[key];
                if (!pending) return nextCircuit;
                if (remoteCircuit?.lastControlCommandId === pending.commandId) {
                  delete pendingCircuitCommandsRef.current[key];
                  return remoteCatalogIsCurrent ? remoteCircuit : {
                    ...nextCircuit,
                    on: Boolean(remoteCircuit.on),
                    adminLocked: Boolean(remoteCircuit.adminLocked),
                    adminDecisionAt: remoteCircuit.adminDecisionAt || null,
                    adminProfileId: remoteCircuit.adminProfileId || null,
                    controlUpdatedAt: remoteCircuit.controlUpdatedAt || null,
                    lastControlCommandId: remoteCircuit.lastControlCommandId || null,
                  };
                }
                if (Date.now() - pending.createdAt < 12000) {
                  return {
                    ...nextCircuit,
                    on: pending.on,
                    controlUpdatedAt: pending.controlUpdatedAt,
                  };
                }
                delete pendingCircuitCommandsRef.current[key];
                if (Boolean(nextCircuit.on) !== Boolean(pending.on)) {
                  const reason = !message.gridAvailable ? "La red eléctrica no está disponible."
                    : !message.cardInserted && !nextCircuit.essential ? "El tarjetero mantiene bloqueadas las cargas no esenciales."
                      : message.reason === "schedule_applied" ? "Un horario activo aplicó otro estado."
                        : message.reason === "card_shutdown_complete" ? "Terminó la cuenta regresiva del tarjetero."
                          : "El servidor o un segundo dispositivo confirmó un estado diferente.";
                  setCircuitDiagnostics((current) => ({ ...current, [key]: {
                    timestamp: message.serverTime || new Date().toISOString(), expected: Boolean(pending.on), actual: Boolean(nextCircuit.on),
                    code: message.reason || "server_state", reason, circuitName: pending.circuitName || nextCircuit.name,
                  } }));
                }
                return nextCircuit;
              });
            });
            if (remoteCatalogIsCurrent && remoteCatalogAt) {
              circuitCatalogUpdatedAtRef.current = remoteCatalogAt;
              setCircuitCatalogUpdatedAt(remoteCatalogAt);
            }
          }
          if (Array.isArray(message.schedules)) setSchedules(message.schedules.filter((schedule) => ["1", "2", "3"].includes(String(schedule?.circuitId))));
          if (Array.isArray(message.profiles)) {
            const localProfilesAt = profilesUpdatedAtRef.current;
            const remoteProfilesAt = message.profilesUpdatedAt ? String(message.profilesUpdatedAt) : null;
            const remoteIsCurrent = !localProfilesAt || (remoteProfilesAt && Date.parse(remoteProfilesAt) >= Date.parse(localProfilesAt));
            if (remoteIsCurrent) {
              setProfiles(normalizeProfiles(message.profiles));
              if (remoteProfilesAt) setProfilesUpdatedAt(remoteProfilesAt);
            }
          }
          if (message.anomalyReviews && typeof message.anomalyReviews === "object") {
            const localReviewsAt = anomalyReviewsUpdatedAtRef.current;
            const remoteReviewsAt = message.anomalyReviewsUpdatedAt ? String(message.anomalyReviewsUpdatedAt) : null;
            const remoteIsCurrent = !localReviewsAt || (remoteReviewsAt && Date.parse(remoteReviewsAt) >= Date.parse(localReviewsAt));
            if (remoteIsCurrent) {
              setAnomalyReviews(normalizeAnomalyReviews(message.anomalyReviews));
              if (remoteReviewsAt) setAnomalyReviewsUpdatedAt(remoteReviewsAt);
            }
          }
          if (Array.isArray(message.permissionRequests)) {
            const localRequestsAt = permissionRequestsUpdatedAtRef.current;
            const remoteRequestsAt = message.permissionRequestsUpdatedAt ? String(message.permissionRequestsUpdatedAt) : null;
            const remoteIsCurrent = !localRequestsAt || (remoteRequestsAt && Date.parse(remoteRequestsAt) >= Date.parse(localRequestsAt));
            if (remoteIsCurrent) {
              const normalizedRequests = normalizePermissionRequests(message.permissionRequests);
              const previousPendingIds = new Set(permissionRequestsRef.current.filter((request) => request.status === "pending").map((request) => request.id));
              const newPending = normalizedRequests.filter((request) => request.status === "pending" && !previousPendingIds.has(request.id));
              const currentProfile = profilesRef.current.find((profile) => profile.id === activeProfileIdRef.current);
              if (permissionNotificationsInitializedRef.current && currentProfile?.role === "normal" && newPending.length) {
                const newest = newPending[newPending.length - 1];
                notifyUser("Nueva solicitud VoltKids", `${newest.profileName} solicita acceso a ${newest.circuitName}.`);
              }
              permissionNotificationsInitializedRef.current = true;
              permissionRequestsRef.current = normalizedRequests;
              setPermissionRequests(normalizedRequests);
              if (remoteRequestsAt) {
                permissionRequestsUpdatedAtRef.current = remoteRequestsAt;
                setPermissionRequestsUpdatedAt(remoteRequestsAt);
              }
            }
          }
          if (Array.isArray(message.archivedCircuits)) {
            const remoteAt = message.archivedCircuitsUpdatedAt ? String(message.archivedCircuitsUpdatedAt) : null;
            const localAt = archivedCircuitsUpdatedAtRef.current;
            if (!localAt || (remoteAt && Date.parse(remoteAt) >= Date.parse(localAt))) {
              const normalized = [];
              archivedCircuitsRef.current = normalized;
              setArchivedCircuits(normalized);
              if (remoteAt) {
                archivedCircuitsUpdatedAtRef.current = remoteAt;
                setArchivedCircuitsUpdatedAt(remoteAt);
              }
            }
          }
          if (Array.isArray(message.activityLog)) {
            const remoteAt = message.activityLogUpdatedAt ? String(message.activityLogUpdatedAt) : null;
            const localAt = activityLogUpdatedAtRef.current;
            if (!localAt || (remoteAt && Date.parse(remoteAt) >= Date.parse(localAt))) {
              const normalized = normalizeActivityLog(message.activityLog);
              activityLogRef.current = normalized;
              setActivityLog(normalized);
              if (remoteAt) {
                activityLogUpdatedAtRef.current = remoteAt;
                setActivityLogUpdatedAt(remoteAt);
              }
            }
          }
          if (message.kidsMissions && typeof message.kidsMissions === "object") {
            const remoteAt = message.kidsMissionsUpdatedAt ? String(message.kidsMissionsUpdatedAt) : null;
            const localAt = kidsMissionsUpdatedAtRef.current;
            if (!localAt || (remoteAt && Date.parse(remoteAt) >= Date.parse(localAt))) {
              const normalized = normalizeKidsMissions(message.kidsMissions);
              kidsMissionsRef.current = normalized;
              setKidsMissions(normalized);
              if (remoteAt) {
                kidsMissionsUpdatedAtRef.current = remoteAt;
                setKidsMissionsUpdatedAt(remoteAt);
              }
            }
          }
          if (Number.isFinite(Number(message.anomalyPowerThreshold))) {
            const remoteThreshold = Number(message.anomalyPowerThreshold);
            const localSettingsAt = anomalySettingsUpdatedAtRef.current;
            const remoteSettingsAt = message.anomalySettingsUpdatedAt ? String(message.anomalySettingsUpdatedAt) : null;
            const remoteIsCurrent = !localSettingsAt || (remoteSettingsAt && Date.parse(remoteSettingsAt) >= Date.parse(localSettingsAt));
            if (remoteIsCurrent && remoteThreshold >= MIN_ANOMALY_POWER_THRESHOLD && remoteThreshold <= MAX_ANOMALY_POWER_THRESHOLD) {
              setAnomalyPowerThreshold(remoteThreshold);
              setAnomalyThresholdInput(String(remoteThreshold));
              if (remoteSettingsAt) setAnomalySettingsUpdatedAt(remoteSettingsAt);
            }
          }
          if (typeof message.cardInserted === "boolean") setCardInserted(message.cardInserted);
          if (message.hardwarePrototype && typeof message.hardwarePrototype === "object") setHardwarePrototype((current) => ({ ...current, ...message.hardwarePrototype }));
          if (message.hardwareBridge && typeof message.hardwareBridge === "object") setHardwareBridge((current) => ({ ...current, ...message.hardwareBridge }));
          if (Object.prototype.hasOwnProperty.call(message, "shutdownAt")) {
            const remaining = message.shutdownAt ? Math.max(0, Math.ceil((new Date(message.shutdownAt).getTime() - Date.now()) / 1000)) : null;
            setShutdownSeconds(message.cardInserted ? null : remaining);
          }
          if (typeof message.gridAvailable === "boolean") setGridAvailable(message.gridAvailable);
          if (Number.isFinite(message.battery)) setBattery(message.battery);
          if (Number.isFinite(message.batteryHealth)) setBatteryHealth(message.batteryHealth);
          if (Number.isFinite(message.batteryCycles)) setBatteryCycles(message.batteryCycles);
          if (Number.isFinite(message.batteryTemperature)) setBatteryTemperature(message.batteryTemperature);
          if (Number.isFinite(message.energy)) setEnergy(message.energy);
          if (Number.isFinite(message.voltage)) setVoltage(message.voltage);
          if (Number.isFinite(message.power)) setPower(message.power);
          if (Number.isFinite(message.tariff)) setTariff(message.tariff);
          if (message.tariffMeta && typeof message.tariffMeta === "object") setTariffMeta((current) => ({ ...current, ...message.tariffMeta }));
          if (message.type === "tariff_refresh_started") setTariffRefreshing(true);
          if (["tariff_status", "tariff_update"].includes(message.type) || message.reason === "tariff_checked" || message.reason === "tariff_updated") setTariffRefreshing(false);
          const tariffNotification = message.tariffNotification;
          if (tariffNotification?.id && tariffNotification.id !== lastTariffNotificationRef.current) {
            lastTariffNotificationRef.current = tariffNotification.id;
            AsyncStorage.setItem("voltkey.lastTariffNotification", tariffNotification.id).catch(() => {});
            notifyUser("Tarifario Edelaysen actualizado", tariffNotification.message || `Se ha actualizado el precio del kWh a $${tariffLabel(message.tariff || tariffRef.current)}.`);
          }
          if (message.type === "presence") setConnectedClients(Array.isArray(message.clients) ? message.clients : []);
          if (message.type === "state_update" && message.reason) {
            setEventMessage(SERVER_REASON_LABELS[message.reason] || "Cambio sincronizado desde el servidor");
          }
          if (message.type === "pong" && Number.isFinite(message.sentAt)) setLatency(Math.max(0, Date.now() - message.sentAt));
          if (message.type === "history" && Array.isArray(message.records)) {
            setHistoryRecords(message.records);
            setHistorySource(message.source || "live");
            setServerAnomalies(Array.isArray(message.anomalies) ? message.anomalies : []);
            setHistoryLoading(false);
          }
          if (message.type === "telemetry") {
            const timestamp = message.timestamp || new Date().toISOString();
            if (Date.now() - lastHistorySampleRef.current >= 60000) {
              const intervalConsumption = Number(message.power || 0) / 1000 / 60;
              setHistoryRecords((currentHistory) => [...currentHistory.slice(-3000), {
                timestamp, voltage: Number(message.voltage || 0), current: Number(message.current || 0),
                power: Number(message.power || 0), consumption: intervalConsumption,
                cost: intervalConsumption * Number(message.tariff || tariffRef.current), source: message.source || "live",
              }]);
              lastHistorySampleRef.current = Date.now();
            }
          }
          if (message.type === "tariff_status" && message.error && message.trigger === "manual") notifyUser("No se pudo actualizar el tarifario", "Se conservará la última tarifa válida. Comprueba la conexión e inténtalo nuevamente.");
          if (message.type === "command_error") {
            if (message.commandId) {
              Object.entries(pendingCircuitCommandsRef.current).forEach(([key, pending]) => {
                if (pending.commandId === message.commandId) {
                  delete pendingCircuitCommandsRef.current[key];
                  setCircuitDiagnostics((current) => ({ ...current, [key]: {
                    timestamp: message.serverTime || new Date().toISOString(), expected: pending.on, actual: pending.previousOn,
                    code: message.command || "command_error", reason: message.message || "El servidor rechazó la orden.", circuitName: pending.circuitName,
                  } }));
                  recordActivity("control", "Orden rechazada", message.message || "El servidor rechazó la orden.", { circuitId: key, circuitName: pending.circuitName, outcome: "failed" });
                }
              });
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "request_state", source: CLIENT_ID, profileId: activeProfileIdRef.current, edition: EDITION_ID }));
              }
            }
            notifyUser("Comando rechazado", message.message || "El servidor no pudo aplicar el cambio.");
          }
        } catch { setEventMessage("Se recibió un dato no reconocido del servidor"); }
      };
      socket.onerror = () => {
        if (generation !== connectionGeneration || socketRef.current !== socket) return;
        setConnection("offline");
        setEventMessage("Conexión interrumpida; intentando recuperar…");
        try { socket.close(); } catch { scheduleReconnect(); }
      };
      socket.onclose = () => {
        if (!alive || generation !== connectionGeneration || socketRef.current !== socket) return;
        socketRef.current = null;
        clearLiveTimers();
        setConnection("offline");
        setConnectedClients([]);
        scheduleReconnect();
      };
    };

    reconnectRef.current = () => {
      reconnectAttempts = 0;
      setEventMessage("Reconexión solicitada; enlazando con el servidor…");
      connect(true);
    };

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appState;
      appState = nextState;
      if (nextState === "active" && previousState !== "active") {
        reconnectAttempts = 0;
        setEventMessage("Aplicación reactivada; restableciendo conexión…");
        connect(true);
      } else if (nextState !== "active") {
        clearReconnectTimer();
        clearLiveTimers();
      }
    });

    connect();
    return () => {
      alive = false;
      connectionGeneration += 1;
      appStateSubscription.remove();
      clearReconnectTimer();
      clearLiveTimers();
      closeCurrentSocket();
      reconnectRef.current = () => {};
    };
  }, [preferencesLoaded]);

  useEffect(() => {
    if (connection === "online") return undefined;
    const timer = setInterval(() => {
      setCircuits((currentCircuits) => {
        const nominal = currentCircuits.reduce((sum, circuit) => sum + (circuit.on ? circuit.power : 0), 0);
        const measured = Math.round(nominal * (0.93 + Math.random() * 0.11));
        const measuredVoltage = +(220 + Math.sin(Date.now() / 37000) * 2.8).toFixed(1);
        setPower(measured);
        setVoltage(measuredVoltage);
        setEnergy((previous) => +(previous + measured / 1000 / 3600).toFixed(4));
        if (Date.now() - lastHistorySampleRef.current >= 60000) {
          const intervalConsumption = measured / 1000 / 60;
          setHistoryRecords((currentHistory) => [...currentHistory.slice(-3000), {
            timestamp: new Date().toISOString(), voltage: measuredVoltage,
            current: measured / Math.max(measuredVoltage, 1), power: measured,
            consumption: intervalConsumption, cost: intervalConsumption * tariff, source: "simulation",
          }]);
          lastHistorySampleRef.current = Date.now();
        }
        return currentCircuits;
      });
      if (!gridAvailable) setBattery((value) => Math.max(5, +(value - 0.015).toFixed(2)));
    }, 1000);
    return () => clearInterval(timer);
  }, [connection, gridAvailable, tariff]);

  useEffect(() => {
    if (connection === "online") return undefined;
    if (!schedules.some((schedule) => schedule.enabled)) {
      schedulePhasesRef.current = {};
      AsyncStorage.setItem("voltkey.schedulePhases", "{}").catch(() => {});
      return undefined;
    }
    const applySchedules = () => {
      const now = new Date();
      const activeScheduleKeys = new Set();
      setCircuits((current) => current.map((circuit) => {
        const circuitSchedules = schedules.filter((schedule) => String(schedule.circuitId) === String(circuit.id) && schedule.enabled);
        if (!circuitSchedules.length) return circuit;
        const circuitKey = String(circuit.id);
        activeScheduleKeys.add(circuitKey);
        let desired = circuitSchedules.some((schedule) => isScheduleActive(schedule, now));
        if ((!cardInserted || !gridAvailable) && !circuit.essential) desired = false;
        const previousPhase = schedulePhasesRef.current[circuitKey];
        schedulePhasesRef.current[circuitKey] = desired;
        if (previousPhase !== undefined && previousPhase === desired) return circuit;
        return circuit.on === desired ? circuit : { ...circuit, on: desired };
      }));
      Object.keys(schedulePhasesRef.current).forEach((key) => {
        if (!activeScheduleKeys.has(key)) delete schedulePhasesRef.current[key];
      });
      AsyncStorage.setItem("voltkey.schedulePhases", JSON.stringify(schedulePhasesRef.current)).catch(() => {});
    };
    applySchedules();
    const timer = setInterval(applySchedules, 15000);
    return () => clearInterval(timer);
  }, [cardInserted, connection, gridAvailable, schedules]);

  const sendCommand = (payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ ...payload, source: CLIENT_ID, profileId: activeProfileIdRef.current, edition: EDITION_ID }));
      return true;
    }
    return false;
  };

  const choosePrototypeCircuit = (slot, circuitId) => {
    const circuitIds = [...(hardwarePrototype.circuitIds || ["1", "2", "3"])];
    circuitIds[slot - 1] = String(circuitId);
    if (new Set(circuitIds).size !== 3) {
      setEventMessage("Cada salida física debe usar un circuito diferente.");
      return;
    }
    setHardwarePrototype((current) => ({ ...current, circuitIds }));
    sendCommand({ type: "set_hardware_prototype", enabled: true, circuitIds });
  };
  const changeRelayPin = (slot, delta) => {
    const pins = [...(hardwarePrototype.relayPins || [12, 11, 10])];
    const reservedCardLedPin = Number(cardLedConfig.pin || 13);
    let pin = pins[slot - 1];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      pin += delta;
      if (pin > 12) pin = 2;
      if (pin < 2) pin = 12;
      if (pin !== reservedCardLedPin && !pins.some((value, index) => index !== slot - 1 && value === pin)) break;
    }
    const activeLow = Boolean((Number(hardwarePrototype.activeLowMask || 0) >> (slot - 1)) & 1);
    sendCommand({ type: "set_relay_config", slot, pin, activeLow });
  };
  const toggleRelayPolarity = (slot) => {
    const pins = hardwarePrototype.relayPins || [12, 11, 10];
    const activeLow = !Boolean((Number(hardwarePrototype.activeLowMask || 0) >> (slot - 1)) & 1);
    sendCommand({ type: "set_relay_config", slot, pin: pins[slot - 1], activeLow });
  };
  const sendCardLedConfig = (changes = {}) => {
    const next = { ...cardLedConfig, ...changes };
    sendCommand({
      type: "set_card_led_config",
      pin: Number(next.pin),
      activeLow: Boolean(next.activeLow),
      outageBlinkMs: CARD_LED_BLINK_OPTIONS.includes(Number(next.outageBlinkMs)) ? Number(next.outageBlinkMs) : 1000,
    });
  };
  const changeCardLedPin = (delta) => {
    const relayPins = hardwarePrototype.relayPins || [12, 11, 10];
    let pin = Number(cardLedConfig.pin || 13);
    for (let attempt = 0; attempt < 12; attempt += 1) {
      pin += delta;
      if (pin > 13) pin = 2;
      if (pin < 2) pin = 13;
      if (!relayPins.includes(pin)) break;
    }
    sendCardLedConfig({ pin });
  };
  const cycleCardLedBlink = () => {
    const currentIndex = CARD_LED_BLINK_OPTIONS.indexOf(Number(cardLedConfig.outageBlinkMs));
    const blinkMs = CARD_LED_BLINK_OPTIONS[(currentIndex + 1) % CARD_LED_BLINK_OPTIONS.length];
    sendCardLedConfig({ outageBlinkMs: blinkMs });
  };

  const recordActivity = (category, action, detail = "", options = {}) => {
    const updatedAt = new Date().toISOString();
    const entry = {
      id: options.id || `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: updatedAt,
      category,
      action,
      detail,
      outcome: options.outcome || "applied",
      circuitId: options.circuit?.id ?? options.circuitId ?? null,
      circuitName: options.circuit?.name || options.circuitName || null,
      profileId: activeProfile.id,
      profileName: activeProfile.name,
      profileRole: activeProfile.role,
      device: Platform.OS === "web" ? "Computador" : "Celular",
    };
    const normalized = normalizeActivityLog([entry, ...activityLogRef.current]);
    activityLogRef.current = normalized;
    activityLogUpdatedAtRef.current = updatedAt;
    setActivityLog(normalized);
    setActivityLogUpdatedAt(updatedAt);
    sendCommand({ type: "record_activity", entry, activityLogUpdatedAt: updatedAt });
    return entry;
  };

  const commitArchivedCircuits = (nextCircuits, message) => {
    const normalized = normalizeArchivedCircuits(nextCircuits);
    const updatedAt = new Date().toISOString();
    archivedCircuitsRef.current = normalized;
    archivedCircuitsUpdatedAtRef.current = updatedAt;
    setArchivedCircuits(normalized);
    setArchivedCircuitsUpdatedAt(updatedAt);
    setEventMessage(message);
    return updatedAt;
  };

  const commitKidsMissions = (nextMissions, message) => {
    const normalized = normalizeKidsMissions(nextMissions);
    const updatedAt = new Date().toISOString();
    kidsMissionsRef.current = normalized;
    kidsMissionsUpdatedAtRef.current = updatedAt;
    setKidsMissions(normalized);
    setKidsMissionsUpdatedAt(updatedAt);
    sendCommand({ type: "set_kids_missions", kidsMissions: normalized, kidsMissionsUpdatedAt: updatedAt });
    setEventMessage(message);
  };

  const commitProfiles = (nextProfiles, message) => {
    const normalized = normalizeProfiles(nextProfiles);
    const updatedAt = new Date().toISOString();
    setProfiles(normalized);
    setProfilesUpdatedAt(updatedAt);
    sendCommand({ type: "set_profiles", profiles: normalized, profilesUpdatedAt: updatedAt });
    setEventMessage(message);
  };

  const commitPermissionRequestsLocally = (nextRequests, message) => {
    const normalized = normalizePermissionRequests(nextRequests);
    const updatedAt = new Date().toISOString();
    permissionRequestsRef.current = normalized;
    permissionRequestsUpdatedAtRef.current = updatedAt;
    setPermissionRequests(normalized);
    setPermissionRequestsUpdatedAt(updatedAt);
    setEventMessage(message);
  };

  const requestCircuitPermission = (circuit) => {
    if (!isChildProfile || kidsThemeId !== "hacker" || !circuit) return;
    if (allowedCircuitIds.has(String(circuit.id))) {
      notifyUser("Acceso disponible", `${circuit.name} ya está autorizado para este perfil.`);
      return;
    }
    const existing = permissionRequestsRef.current.find((request) => request.status === "pending" && request.profileId === activeProfile.id && String(request.circuitId) === String(circuit.id));
    if (existing) {
      notifyUser("Solicitud pendiente", `El administrador todavía debe responder la solicitud de ${circuit.name}.`);
      return;
    }
    if (connection === "online") {
      sendCommand({ type: "request_circuit_permission", circuitId: circuit.id });
      setEventMessage(`${circuit.name}: solicitud enviada al administrador`);
      recordActivity("profile", "Permiso solicitado", `${activeProfile.name} solicitó acceso a ${circuit.name}.`, { circuit, outcome: "pending" });
      notifyUser("Solicitud enviada", `El perfil administrador recibirá una notificación para ${circuit.name}.`);
      return;
    }
    const createdAt = new Date().toISOString();
    commitPermissionRequestsLocally([...permissionRequestsRef.current, {
      id: `local-request-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      profileId: activeProfile.id,
      profileName: activeProfile.name,
      circuitId: circuit.id,
      circuitName: circuit.name,
      status: "pending",
      createdAt,
      resolvedAt: null,
      resolvedBy: null,
    }], `${circuit.name}: solicitud guardada en este dispositivo`);
    recordActivity("profile", "Permiso solicitado", `${activeProfile.name} solicitó acceso a ${circuit.name} sin conexión.`, { circuit, outcome: "pending" });
    notifyUser("Solicitud guardada", "El administrador podrá revisarla al cambiar de perfil en este dispositivo. Para avisar a otros equipos, conecta VoltKey al servidor.");
  };

  const cancelPermissionRequest = (request) => {
    if (!isChildProfile || !request || request.profileId !== activeProfile.id || request.status !== "pending") return;
    if (connection === "online") {
      sendCommand({ type: "cancel_permission_request", requestId: request.id });
      setEventMessage(`${request.circuitName}: cancelación de solicitud enviada`);
      recordActivity("profile", "Solicitud cancelada", `${request.profileName} canceló la solicitud para ${request.circuitName}.`, { circuitId: request.circuitId, circuitName: request.circuitName });
      return;
    }
    const resolvedAt = new Date().toISOString();
    commitPermissionRequestsLocally(permissionRequestsRef.current.map((item) => item.id === request.id ? { ...item, status: "cancelled", resolvedAt, resolvedBy: activeProfile.id } : item), `${request.circuitName}: solicitud cancelada`);
    recordActivity("profile", "Solicitud cancelada", `${request.profileName} canceló la solicitud para ${request.circuitName}.`, { circuitId: request.circuitId, circuitName: request.circuitName });
  };

  const resolvePermissionRequest = (requestId, decision, grantScope = null) => {
    if (isChildProfile || !["approved", "denied"].includes(decision)) return;
    const request = permissionRequestsRef.current.find((item) => item.id === requestId && item.status === "pending");
    if (!request) return;
    const safeScope = decision === "approved" && ["once", "hour", "permanent"].includes(grantScope) ? grantScope : null;
    if (decision === "approved" && !safeScope) return;
    if (connection === "online") {
      sendCommand({ type: "resolve_permission_request", requestId, decision, grantScope: safeScope });
      setEventMessage(`${request.profileName}: respuesta enviada para ${request.circuitName}`);
      recordActivity("profile", decision === "approved" ? "Permiso aprobado" : "Permiso rechazado", `${request.profileName} · ${request.circuitName}${safeScope ? ` · ${PERMISSION_GRANT_OPTIONS.find((option) => option.id === safeScope)?.label}` : ""}.`, { circuitId: request.circuitId, circuitName: request.circuitName });
      return;
    }
    const resolvedAt = new Date().toISOString();
    const expiresAt = safeScope === "hour" ? new Date(Date.now() + 60 * 60 * 1000).toISOString() : null;
    commitPermissionRequestsLocally(permissionRequestsRef.current.map((item) => item.id === request.id ? {
      ...item, status: decision, resolvedAt, resolvedBy: activeProfile.id, grantScope: safeScope,
      expiresAt, remainingUses: safeScope === "once" ? 1 : null,
    } : item), `${request.circuitName}: solicitud ${decision === "approved" ? "aprobada" : "rechazada"}`);
    if (decision === "approved" && safeScope === "permanent") {
      const nextProfiles = profilesRef.current.map((profile) => profile.id === request.profileId ? {
        ...profile,
        allowedCircuitIds: [...new Set([...(profile.allowedCircuitIds || []), request.circuitId])],
        updatedAt: resolvedAt,
      } : profile);
      commitProfiles(nextProfiles, `${request.profileName}: permiso añadido para ${request.circuitName}`);
    }
    recordActivity("profile", decision === "approved" ? "Permiso aprobado" : "Permiso rechazado", `${request.profileName} · ${request.circuitName}${safeScope ? ` · ${PERMISSION_GRANT_OPTIONS.find((option) => option.id === safeScope)?.label}` : ""}.`, { circuitId: request.circuitId, circuitName: request.circuitName });
  };

  const openPermissionCenter = () => {
    if (isChildProfile || userMode === "technical") return;
    setProfileSwitcherVisible(false);
    setPermissionCenterVisible(true);
  };

  const closeProfileForm = () => {
    setProfileFormVisible(false);
    setEditingProfileId(null);
    setProfileForm({ ...EMPTY_PROFILE_FORM, allowedCircuitIds: [] });
  };

  const openNewProfile = () => {
    if (isChildProfile || userMode === "technical") return;
    if (profiles.length >= 12) {
      notifyUser("Límite de perfiles", "VoltKey permite hasta 12 perfiles familiares en esta versión.");
      return;
    }
    setEditingProfileId(null);
    setProfileForm({ ...EMPTY_PROFILE_FORM, allowedCircuitIds: [] });
    setProfileFormVisible(true);
  };

  const openEditProfile = (profile) => {
    if (isChildProfile || userMode === "technical" || !profile) return;
    setEditingProfileId(profile.id);
    setProfileForm({
      name: profile.name,
      role: profile.role,
      icon: profile.icon || (profile.role === "child" ? "happy-outline" : "person-outline"),
      pin: "",
      allowedCircuitIds: [...(profile.allowedCircuitIds || [])],
    });
    setProfileFormVisible(true);
  };

  const updateProfileForm = (field, value) => setProfileForm((current) => ({ ...current, [field]: value }));
  const toggleProfilePermission = (circuitId) => setProfileForm((current) => ({
    ...current,
    allowedCircuitIds: current.allowedCircuitIds.some((id) => String(id) === String(circuitId))
      ? current.allowedCircuitIds.filter((id) => String(id) !== String(circuitId))
      : [...current.allowedCircuitIds, circuitId],
  }));

  const saveProfile = () => {
    if (isChildProfile || userMode === "technical") return;
    const name = profileForm.name.trim();
    const previous = profiles.find((profile) => profile.id === editingProfileId);
    if (!name) {
      notifyUser("Falta el nombre", "Escribe un nombre para identificar el perfil.");
      return;
    }
    if (previous?.id === activeProfileId && previous.role !== profileForm.role) {
      notifyUser("Perfil activo", "No puedes cambiar el tipo del perfil que estás usando. Activa primero otro administrador.");
      return;
    }
    if (profileForm.role === "normal" && !/^\d{4}$/.test(profileForm.pin) && !previous?.pinHash) {
      notifyUser("PIN obligatorio", "Los perfiles normales necesitan un PIN de cuatro dígitos para proteger el control absoluto.");
      return;
    }
    if (profileForm.role === "child" && !profileForm.allowedCircuitIds.length) {
      notifyUser("Sin permisos", "Autoriza al menos un circuito para que VoltKids pueda usar la aplicación.");
      return;
    }
    const id = previous?.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const profile = {
      id,
      name,
      role: profileForm.role === "child" ? "child" : "normal",
      icon: PROFILE_ICONS.includes(profileForm.icon) ? profileForm.icon : profileForm.role === "child" ? "happy-outline" : "person-outline",
      pinHash: profileForm.role === "normal"
        ? (/^\d{4}$/.test(profileForm.pin) ? pinHash(profileForm.pin, id) : previous?.pinHash || "")
        : "",
      allowedCircuitIds: profileForm.role === "child" ? [...profileForm.allowedCircuitIds] : [],
      createdAt: previous?.createdAt || now,
      updatedAt: now,
    };
    const next = previous
      ? profiles.map((item) => item.id === previous.id ? profile : item)
      : [...profiles, profile];
    if (!next.some((item) => item.role === "normal")) {
      notifyUser("Administrador requerido", "Debe existir al menos un perfil administrador con control absoluto.");
      return;
    }
    commitProfiles(next, `${name}: perfil ${previous ? "actualizado" : "añadido"}`);
    recordActivity("profile", previous ? "Perfil actualizado" : "Perfil añadido", `${name} · ${profile.role === "child" ? "VoltKids" : "Administrador"}.`);
    closeProfileForm();
  };

  const deleteProfile = () => {
    const target = profiles.find((profile) => profile.id === editingProfileId);
    if (!target || isChildProfile || userMode === "technical") return;
    if (target.id === activeProfileId) {
      notifyUser("Perfil activo", "Activa otro administrador antes de eliminar este perfil.");
      return;
    }
    if (target.role === "normal" && profiles.filter((profile) => profile.role === "normal").length <= 1) {
      notifyUser("Administrador requerido", "No se puede eliminar el único administrador con control absoluto.");
      return;
    }
    confirmUser("Eliminar perfil", `¿Quieres eliminar el perfil “${target.name}”?`, () => {
      const resolvedAt = new Date().toISOString();
      const nextRequests = permissionRequestsRef.current.map((request) => ["pending", "approved"].includes(request.status) && request.profileId === target.id
        ? { ...request, status: "cancelled", resolvedAt, resolvedBy: activeProfile.id }
        : request);
      if (nextRequests.some((request, index) => request !== permissionRequestsRef.current[index])) {
        commitPermissionRequestsLocally(nextRequests, `${target.name}: solicitudes pendientes canceladas`);
      }
      commitProfiles(profiles.filter((profile) => profile.id !== target.id), `${target.name}: perfil eliminado`);
      recordActivity("profile", "Perfil eliminado", `${target.name} fue retirado de la familia VoltKey.`);
      closeProfileForm();
    });
  };

  const activateProfile = (profile) => {
    if (userMode === "technical") {
      setProfileSwitcherVisible(false);
      setPinRequest(null);
      notifyUser("Perfil bloqueado", "Sal de VoltKey Tec antes de cambiar a otro perfil administrador o VoltKids.");
      return;
    }
    setActiveProfileId(profile.id);
    recordActivity("profile", "Perfil cambiado", `Nuevo perfil activo: ${profile.name} · ${profile.role === "child" ? "VoltKids" : "Administrador"}.`);
    setProfileSwitcherVisible(false);
    setPinRequest(null);
    if (profile.role === "child") {
      setModeTransition(null);
      setUserMode("home");
      setScreen("inicio");
      setEventMessage(`${profile.name}: controles familiares habilitados`);
    } else {
      setScreen("inicio");
      setEventMessage(`${profile.name}: control absoluto habilitado`);
    }
  };

  const selectProfile = (profile) => {
    if (userMode === "technical") {
      setProfileSwitcherVisible(false);
      notifyUser("Perfil bloqueado", "VoltKey Tec conserva el perfil administrador con el que ingresaste. Sal del modo técnico para cambiarlo.");
      return;
    }
    if (!profile || profile.id === activeProfileId) {
      setProfileSwitcherVisible(false);
      return;
    }
    if (profile.role === "normal") {
      if (!profile.pinHash) {
        notifyUser("PIN pendiente", `Configura un PIN para el administrador ${profile.name} antes de utilizarlo.`);
        return;
      }
      setProfileSwitcherVisible(false);
      setPinRequest({ profileId: profile.id, value: "", error: "" });
      return;
    }
    if (isChildProfile) {
      activateProfile(profile);
      return;
    }
    if (!activeProfile.pinHash) {
      setProfileSwitcherVisible(false);
      notifyUser("Protege al administrador", "Configura primero un PIN de cuatro dígitos. Así podrás volver desde VoltKids sin perder el control.");
      openEditProfile(activeProfile);
      return;
    }
    activateProfile(profile);
  };

  const confirmProfilePin = () => {
    if (userMode === "technical") {
      setPinRequest(null);
      notifyUser("Perfil bloqueado", "Sal de VoltKey Tec para completar un cambio de perfil.");
      return;
    }
    const target = profiles.find((profile) => profile.id === pinRequest?.profileId);
    if (!target || !/^\d{4}$/.test(pinRequest?.value || "")) {
      setPinRequest((current) => current ? { ...current, error: "Ingresa los cuatro dígitos." } : current);
      return;
    }
    if (pinHash(pinRequest.value, target.id) !== target.pinHash) {
      setPinRequest((current) => current ? { ...current, value: "", error: "PIN incorrecto. Intenta nuevamente." } : current);
      return;
    }
    activateProfile(target);
  };

  const openProfileManager = () => {
    if (isChildProfile || userMode === "technical") return;
    setProfileSwitcherVisible(false);
    setScreen("ajustes");
  };

  useEffect(() => {
    if (connection !== "online") return;
    setHistoryLoading(true);
    sendCommand({ type: "request_history", period: selectedPeriod });
    const timer = setTimeout(() => setHistoryLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [connection, selectedPeriod]);

  useEffect(() => {
    if (shutdownSeconds === null || cardInserted) return undefined;
    if (shutdownSeconds <= 0) {
      setCircuits((current) => current.map((circuit) => circuit.essential ? circuit : { ...circuit, on: false }));
      setShutdownSeconds(null);
      setEventMessage("Cargas no esenciales desconectadas");
      return undefined;
    }
    const timer = setTimeout(() => setShutdownSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cardInserted, shutdownSeconds]);

  const changePalette = async (id) => {
    setPaletteId(id);
    await AsyncStorage.setItem("voltkey.palette", id).catch(() => {});
  };
  const changeKidsTheme = (id) => {
    if (!KIDS_PALETTES[id] || id === kidsThemeId || kidsThemeTransition) return;
    const applyTheme = () => {
      setKidsThemeId(id);
      AsyncStorage.setItem("voltkey.kidsTheme", id).catch(() => {});
      setEventMessage(id === "hacker" ? "VoltKids Hacker habilitado" : `Tema VoltKids ${KIDS_PALETTES[id].name} habilitado`);
    };
    if (id !== "hacker" && kidsThemeId !== "hacker") {
      applyTheme();
      return;
    }
    kidsTransitionTimersRef.current.forEach((timer) => clearTimeout(timer));
    setKidsThemeTransition({ from: kidsThemeId, target: id });
    kidsTransitionTimersRef.current = [
      setTimeout(applyTheme, 650),
      setTimeout(() => setKidsThemeTransition(null), 2050),
    ];
  };
  const toggleEcoMission = (tip) => {
    if (!isChildProfile || !tip) return;
    const key = `${activeProfile.id}:${tip.id}`;
    const next = { ...kidsMissionsRef.current };
    if (next[key]) {
      delete next[key];
      commitKidsMissions(next, `${tip.title}: misión desmarcada`);
      recordActivity("profile", "Misión ecológica desmarcada", tip.title);
      return;
    }
    next[key] = { profileId: activeProfile.id, tipId: tip.id, completedAt: new Date().toISOString(), estimatedWh: tip.savingWh || 0 };
    commitKidsMissions(next, `${tip.title}: misión completada`);
    recordActivity("profile", "Misión ecológica completada", `${tip.title}${tip.savingWh ? ` · ahorro educativo aproximado ${tip.savingWh} Wh` : ""}.`);
  };
  const changeFont = async (id) => {
    setFontId(id);
    await AsyncStorage.setItem("voltkey.font", id).catch(() => {});
  };
  const startModeTransition = (id) => {
    transitionTimersRef.current.forEach((timer) => clearTimeout(timer));
    if (id === "technical") technicalProfileRef.current = activeProfile;
    setModeTransition(id);
    transitionTimersRef.current = [
      setTimeout(() => {
        if (id !== "technical") technicalProfileRef.current = null;
        if (id === "technical") {
          const startedAt = new Date().toISOString();
          setTechnicalSession({ startedAt, endedAt: null, status: "active", responsible: activeProfile.name, task: "Mantenimiento general" });
          setMaintenanceChecks({});
          recordActivity("security", "Sesión VoltKey Tec iniciada", `Responsable: ${activeProfile.name} · Mantenimiento general.`);
        } else if (technicalSession?.status === "active") {
          const endedAt = new Date().toISOString();
          setTechnicalSession((current) => current ? { ...current, status: "completed", endedAt } : current);
          recordActivity("security", "Sesión VoltKey Tec finalizada", `${MAINTENANCE_TASKS.filter((task) => maintenanceChecks[task.id]).length}/${MAINTENANCE_TASKS.length} verificaciones completadas.`);
        }
        setUserMode(id);
        setScreen("inicio");
        setEventMessage(id === "technical" ? "VoltKey Tec habilitado" : "VoltKey restaurado");
      }, 900),
      setTimeout(() => setModeTransition(null), 2700),
    ];
  };
  const changeUserMode = (id) => {
    if (isChildProfile) {
      notifyUser("Acceso protegido", "VoltKey Tec solo está disponible para perfiles normales con control absoluto.");
      return;
    }
    if (id === userMode || modeTransition) return;
    if (id === "technical") {
      confirmChoice(
        "¿Entrar a VoltKey Tec?",
        "Este entorno contiene herramientas avanzadas. Trabaja sin tensión, aplica bloqueo y sigue los procedimientos de seguridad.",
        "Entrar",
        () => startModeTransition(id),
      );
      return;
    }
    const completed = MAINTENANCE_TASKS.filter((task) => maintenanceChecks[task.id]).length;
    confirmChoice(
      technicalSession?.status === "active" ? "¿Finalizar la sesión técnica?" : "¿Salir de VoltKey Tec?",
      technicalSession?.status === "active"
        ? `Se cerrará el registro de ${technicalSession.responsible || activeProfile.name}. Hay ${completed}/${MAINTENANCE_TASKS.length} verificaciones marcadas. VoltKey volverá al tema habitual.`
        : "VoltKey volverá a la paleta y a la interfaz que utilizabas antes de la mantención.",
      technicalSession?.status === "active" ? "Finalizar y salir" : "Salir",
      () => startModeTransition(id),
    );
  };
  const changeCircuitViewMode = (id) => {
    if (isChildProfile) return;
    if (!["detail", "large"].includes(id)) return;
    setCircuitViewMode(id);
    setEventMessage(id === "large" ? "Vista de circuitos en botones" : "Vista de circuitos en lista");
  };
  const changeLayoutMode = (id) => {
    if (isChildProfile) return;
    setLayoutMode(id);
    setEventMessage(`Interfaz ${LAYOUT_MODES.find((item) => item.id === id)?.label.toLowerCase() || id} habilitada`);
  };
  const reconnectNow = () => {
    if (!WS_URL) {
      notifyUser("Servidor no configurado", "Inicia el sistema con Iniciar-VoltKey.cmd para generar la dirección de sincronización.");
      return;
    }
    reconnectRef.current();
  };
  const runTechnicalDiagnostic = () => {
    if (connection !== "online") {
      reconnectNow();
      notifyUser("Recuperando conexión", "VoltKey intentará enlazar nuevamente antes de solicitar las lecturas.");
      return;
    }
    setHistoryLoading(true);
    sendCommand({ type: "request_state" });
    sendCommand({ type: "request_history", period: selectedPeriod });
    setEventMessage("Diagnóstico técnico solicitado");
    setTimeout(() => setHistoryLoading(false), 8000);
    notifyUser("Diagnóstico solicitado", "Se actualizaron el estado, las lecturas y el historial disponible.");
  };
  const toggleMaintenanceTask = (id) => {
    const task = MAINTENANCE_TASKS.find((item) => item.id === id);
    const wasCompleted = Boolean(maintenanceChecks[id]);
    setMaintenanceChecks((currentChecks) => ({
      ...currentChecks,
      [id]: currentChecks[id] ? null : new Date().toISOString(),
    }));
    if (task) recordActivity("security", wasCompleted ? "Verificación reabierta" : "Verificación técnica completada", task.title);
  };
  const saveTechnicalSessionDetails = () => {
    if (!technicalSession) return;
    recordActivity("security", "Datos de sesión técnica actualizados", `Responsable: ${technicalSession.responsible || activeProfile.name} · Trabajo: ${technicalSession.task || "Sin descripción"}.`);
    setEventMessage("Datos de la sesión técnica guardados");
  };
  const refreshTariff = () => {
    if (connection !== "online") {
      notifyUser("Servidor sin conexión", "La actualización automática se realiza desde el servidor Python cuando vuelve a tener internet.");
      return;
    }
    setTariffRefreshing(true);
    sendCommand({ type: "refresh_tariff" });
    setTimeout(() => setTariffRefreshing(false), 25000);
  };
  const toggleCard = () => {
    if (isChildProfile) {
      notifyUser("Control protegido", "El tarjetero solo puede administrarse desde un perfil administrador.");
      return;
    }
    if (cardInserted) {
      restoreIdsRef.current = circuits.filter((circuit) => circuit.on && !circuit.essential).map((circuit) => circuit.id);
      setCardInserted(false);
      setShutdownSeconds(5);
      setEventMessage("Tarjeta retirada: apagado programado");
      sendCommand({ type: "set_card", inserted: false, delaySeconds: 5, commandId: `card-out-${Date.now()}` });
      recordActivity("security", "Tarjeta retirada", "Se programó el apagado de cargas no esenciales en 5 segundos.");
    } else {
      const restoreIds = restoreIdsRef.current;
      setCardInserted(true);
      setShutdownSeconds(null);
      setCircuits((current) => current.map((circuit) => restoreIds.includes(circuit.id) ? { ...circuit, on: true } : circuit));
      setEventMessage("Tarjeta insertada: estado restaurado");
      sendCommand({ type: "set_card", inserted: true, commandId: `card-in-${Date.now()}` });
      recordActivity("security", "Tarjeta insertada", "VoltKey restauró las cargas que estaban activas antes del retiro.");
    }
  };
  const applyCircuitChange = (id, value, fromVoltKids = false) => {
    const target = circuitsRef.current.find((circuit) => String(circuit.id) === String(id));
    if (!target) return false;
    if (fromVoltKids && (!isChildProfile || !allowedCircuitIds.has(String(id)))) {
      recordActivity("control", "Orden bloqueada", "El perfil o sus permisos cambiaron antes de aplicar la orden.", { circuit: target, outcome: "blocked" });
      notifyUser("Acción cancelada", "El perfil o sus permisos cambiaron durante la cuenta regresiva.");
      return false;
    }
    if (fromVoltKids && target.adminLocked) {
      recordActivity("control", "Orden bloqueada", "El administrador mantiene el control prioritario del circuito.", { circuit: target, outcome: "blocked" });
      notifyUser("Decisión del administrador", `${target.name} quedó ${target.on ? "encendido" : "apagado"} por decisión de un administrador. La acción VoltKids fue cancelada.`);
      return false;
    }
    if ((!cardInserted || !gridAvailable) && !target.essential) {
      const reason = !gridAvailable ? "La red eléctrica está interrumpida y el circuito no es esencial." : "El tarjetero mantiene deshabilitadas las cargas no esenciales.";
      setCircuitDiagnostics((current) => ({ ...current, [String(id)]: { timestamp: new Date().toISOString(), expected: Boolean(value), actual: Boolean(target.on), code: !gridAvailable ? "grid_unavailable" : "card_removed", reason, circuitName: target.name } }));
      recordActivity("control", "Orden bloqueada", reason, { circuit: target, outcome: "blocked" });
      notifyUser("Circuito protegido", "Este circuito no esencial permanece bloqueado mientras la tarjeta o la red no estén disponibles.");
      return false;
    }
    if (target.on === value) {
      setEventMessage(`${target.name}: el estado solicitado ya estaba aplicado`);
      return true;
    }
    const controlUpdatedAt = new Date().toISOString();
    const commandId = `${CLIENT_ID}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setCircuits((currentCircuits) => currentCircuits.map((circuit) => String(circuit.id) === String(id) ? {
      ...circuit,
      on: value,
      adminLocked: Boolean(circuit.adminLocked),
      adminDecisionAt: circuit.adminLocked && !fromVoltKids ? controlUpdatedAt : circuit.adminDecisionAt || null,
      adminProfileId: circuit.adminLocked && !fromVoltKids ? activeProfile.id : circuit.adminProfileId || null,
      controlUpdatedAt,
    } : circuit));
    setEventMessage(`${target.name}: ${value ? "encendido" : "apagado"}${fromVoltKids ? " desde VoltKids" : target.adminLocked ? " con bloqueo administrativo" : ""}`);
    setCircuitDiagnostics((current) => {
      if (!current[String(id)]) return current;
      const next = { ...current };
      delete next[String(id)];
      return next;
    });
    pendingCircuitCommandsRef.current[String(id)] = { commandId, on: Boolean(value), previousOn: Boolean(target.on), circuitName: target.name, controlUpdatedAt, createdAt: Date.now() };
    const delivered = sendCommand({ type: "set_circuit", id, on: value, commandId });
    if (!delivered) delete pendingCircuitCommandsRef.current[String(id)];
    if (fromVoltKids && connection !== "online") {
      const oneTimeGrant = permissionRequestsRef.current.find((request) => permissionGrantIsActive(request, activeProfile.id, id) && request.grantScope === "once");
      if (oneTimeGrant) commitPermissionRequestsLocally(permissionRequestsRef.current.map((request) => request.id === oneTimeGrant.id ? { ...request, status: "used", remainingUses: 0, resolvedAt: new Date().toISOString() } : request), `${target.name}: permiso de una vez utilizado`);
    }
    recordActivity("control", value ? "Circuito encendido" : "Circuito apagado", `${fromVoltKids ? "Acción VoltKids con espera de seguridad" : "Orden del administrador"}${target.adminLocked ? " · control bloqueado" : ""}.`, { circuit: target, outcome: delivered || connection === "local" ? "applied" : "pending" });
    return true;
  };
  const toggleCircuit = (id, value) => {
    const target = circuitsRef.current.find((circuit) => String(circuit.id) === String(id));
    if (isChildProfile && !allowedCircuitIds.has(String(id))) {
      recordActivity("control", "Orden bloqueada", "VoltKids no tiene permiso para este circuito.", { circuit: target, outcome: "blocked" });
      notifyUser("Circuito no autorizado", "Pide al administrador que habilite este circuito.");
      return;
    }
    if (isChildProfile && target?.adminLocked) {
      recordActivity("control", "Orden bloqueada", "La decisión del administrador tiene prioridad.", { circuit: target, outcome: "blocked" });
      notifyUser("Decisión del administrador", `${target.name} está ${target.on ? "encendido" : "apagado"} por decisión de un administrador. VoltKids no puede cambiarlo hasta que se libere el control.`);
      return;
    }
    if (!target || ((!cardInserted || !gridAvailable) && !target.essential)) return;
    if (isChildProfile) {
      setKidsCircuitAction({
        id: target.id,
        name: target.name,
        value: Boolean(value),
        seconds: 10,
        controlUpdatedAt: target.controlUpdatedAt || null,
      });
      setEventMessage(`${target.name}: acción VoltKids pendiente por 10 segundos`);
      return;
    }
    applyCircuitChange(target.id, Boolean(value), false);
  };

  useEffect(() => {
    if (!kidsCircuitAction) return undefined;
    if (!isChildProfile) {
      setKidsCircuitAction(null);
      return undefined;
    }
    const currentTarget = circuitsRef.current.find((circuit) => String(circuit.id) === String(kidsCircuitAction.id));
    if (!currentTarget || currentTarget.adminLocked || (currentTarget.controlUpdatedAt || null) !== (kidsCircuitAction.controlUpdatedAt || null)) {
      setKidsCircuitAction(null);
      setEventMessage(`${kidsCircuitAction.name}: acción VoltKids cancelada por un cambio prioritario`);
      notifyUser("Acción VoltKids cancelada", "El administrador o el sistema cambió este circuito durante la cuenta regresiva.");
      return undefined;
    }
    if (kidsCircuitAction.seconds <= 0) {
      const action = kidsCircuitAction;
      setKidsCircuitAction(null);
      applyCircuitChange(action.id, action.value, true);
      return undefined;
    }
    const timer = setTimeout(() => setKidsCircuitAction((current) => current ? { ...current, seconds: current.seconds - 1 } : null), 1000);
    return () => clearTimeout(timer);
  }, [circuits, isChildProfile, kidsCircuitAction]);
  const toggleCircuitLock = (id) => {
    if (isChildProfile) return;
    const target = circuits.find((circuit) => circuit.id === id);
    if (!target) return;
    const locked = !target.adminLocked;
    const updatedAt = new Date().toISOString();
    setCircuits((current) => current.map((circuit) => circuit.id === id ? {
      ...circuit,
      adminLocked: locked,
      adminDecisionAt: locked ? updatedAt : null,
      adminProfileId: locked ? activeProfile.id : null,
      controlUpdatedAt: updatedAt,
    } : circuit));
    setEventMessage(`${target.name}: ${locked ? "bloqueado para VoltKids" : "control liberado para VoltKids"}`);
    sendCommand({ type: "set_circuit_lock", id, locked });
    recordActivity("security", locked ? "Control VoltKids bloqueado" : "Control VoltKids liberado", locked ? "La decisión administrativa tendrá prioridad hasta liberar el circuito." : "VoltKids puede volver a utilizar el circuito si tiene permiso.", { circuit: target });
  };
  const toggleEssential = (id) => {
    if (isChildProfile) return;
    const target = circuits.find((circuit) => circuit.id === id);
    if (!target) return;
    const essential = !target.essential;
    setCircuits((currentCircuits) => currentCircuits.map((circuit) => {
      if (circuit.id !== id) return circuit;
      return { ...circuit, essential, on: !cardInserted && !essential ? false : circuit.on };
    }));
    setEventMessage(`${target.name}: ${essential ? "circuito esencial" : "circuito normal"}`);
    sendCommand({ type: "set_essential", id, essential });
    recordActivity("circuit", essential ? "Circuito marcado esencial" : "Prioridad esencial retirada", `${target.name} ${essential ? "se incluirá" : "ya no se incluirá"} en el respaldo.`, { circuit: target });
  };
  const toggleGrid = () => {
    if (isChildProfile) return;
    const next = !gridAvailable;
    setGridAvailable(next);
    if (!next) {
      setCircuits((currentCircuits) => currentCircuits.map((circuit) => circuit.essential ? circuit : { ...circuit, on: false }));
      setEventMessage("Corte detectado: respaldo activado");
    } else setEventMessage("Red restablecida: batería en carga");
    sendCommand({ type: "set_grid", available: next, commandId: `grid-${next ? "on" : "off"}-${Date.now()}` });
    recordActivity("security", next ? "Red restablecida" : "Corte de red simulado", next ? "La batería volvió al estado de carga." : "Las cargas no esenciales fueron desconectadas.");
  };

  const updateCircuitForm = (field, value) => {
    setCircuitForm((currentForm) => ({ ...currentForm, [field]: value }));
  };

  const markCircuitCatalogUpdated = () => {
    const updatedAt = new Date().toISOString();
    circuitCatalogUpdatedAtRef.current = updatedAt;
    setCircuitCatalogUpdatedAt(updatedAt);
    return updatedAt;
  };

  const openNewCircuit = () => {
    if (isChildProfile) return;
    setEditingCircuitId(null);
    setCircuitForm({ ...EMPTY_CIRCUIT_FORM });
    setCircuitModalVisible(true);
  };

  const openEditCircuit = (circuit) => {
    if (isChildProfile) return;
    if (!circuit) return;
    setEditingCircuitId(circuit.id);
    setCircuitForm({
      ...EMPTY_CIRCUIT_FORM,
      name: circuit.name || "",
      room: circuit.room || "",
      category: circuit.category || "general",
      brand: circuit.brand || "",
      model: circuit.model || "",
      power: String(circuit.power || ""),
      voltage: String(circuit.voltage || 220),
      current: circuit.current ? String(circuit.current) : "",
      breaker: circuit.breaker ? String(circuit.breaker) : "",
      anomalyThreshold: circuit.anomalyThreshold ? String(circuit.anomalyThreshold) : "",
      essential: Boolean(circuit.essential),
      sourceType: circuit.sourceType || "text",
      sourceText: circuit.sourceText || "",
      photoUri: circuit.photoUri || "",
      datasheetUrl: circuit.datasheetUrl || "",
      notes: circuit.notes || "",
    });
    setCircuitModalVisible(true);
  };

  const closeCircuitModal = () => {
    setCircuitModalVisible(false);
    setEditingCircuitId(null);
    setCircuitForm({ ...EMPTY_CIRCUIT_FORM });
  };

  const readCircuitText = () => {
    if (!circuitForm.sourceText.trim()) {
      notifyUser("Falta el texto", "Copia primero la información de la placa o ficha técnica.");
      return;
    }
    const parsed = parseTechnicalText(circuitForm.sourceText);
    const detectedEntries = Object.entries(parsed).filter(([, value]) => value);
    if (!detectedEntries.length) {
      notifyUser("Sin datos reconocidos", "Usa líneas como “Marca:…”, “Modelo:…” y valores con unidades W, V o A.");
      return;
    }
    setCircuitForm((currentForm) => {
      const next = { ...currentForm };
      detectedEntries.forEach(([key, value]) => { next[key] = value; });
      return next;
    });
    notifyUser("Datos encontrados", `Se completaron ${detectedEntries.length} campos. Revísalos antes de guardar.`);
  };

  const pickCircuitPhoto = async (source) => {
    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          notifyUser("Permiso necesario", "Autoriza la cámara para fotografiar la placa o ficha técnica.");
          return;
        }
      }
      const options = { mediaTypes: ["images"], allowsEditing: true, quality: 0.8 };
      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (!result.canceled && result.assets?.[0]?.uri) {
        const originalUri = result.assets[0].uri;
        let storedUri = originalUri;
        if (Platform.OS !== "web" && FileSystem.documentDirectory) {
          const directory = `${FileSystem.documentDirectory}voltkey-circuit-photos/`;
          await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
          const extension = originalUri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)?.[1] || "jpg";
          storedUri = `${directory}circuit-${Date.now()}.${extension}`;
          await FileSystem.copyAsync({ from: originalUri, to: storedUri });
        }
        updateCircuitForm("photoUri", storedUri);
      }
    } catch {
      notifyUser("No se pudo abrir la imagen", "Intenta nuevamente desde la cámara o la galería.");
    }
  };

  const openDatasheet = async () => {
    const url = circuitForm.datasheetUrl.trim();
    if (!isWebUrl(url)) {
      notifyUser("Enlace no válido", "El enlace debe comenzar con http:// o https://.");
      return;
    }
    try { await Linking.openURL(url); }
    catch { notifyUser("No se pudo abrir", "Comprueba el enlace y la conexión a internet."); }
  };

  const saveCircuit = () => {
    if (isChildProfile) return;
    const name = circuitForm.name.trim();
    const nominalPower = toNumber(circuitForm.power);
    const voltage = toNumber(circuitForm.voltage) || 220;
    const enteredCurrent = toNumber(circuitForm.current);
    const breaker = toNumber(circuitForm.breaker);
    const individualThreshold = toNumber(circuitForm.anomalyThreshold) || Math.max(100, Math.round(nominalPower * 1.5));
    if (!name) {
      notifyUser("Falta el nombre", "Asigna un nombre que permita identificar el circuito.");
      return;
    }
    if (nominalPower <= 0) {
      notifyUser("Potencia no válida", "Ingresa la potencia nominal del circuito en watts.");
      return;
    }
    if (individualThreshold < 100 || individualThreshold > 100000) {
      notifyUser("Límite no válido", "La alerta individual debe estar entre 100 y 100.000 W.");
      return;
    }
    if (circuitForm.sourceType === "photo" && !circuitForm.photoUri) {
      notifyUser("Falta la foto", "Toma o selecciona una imagen para usar esta fuente.");
      return;
    }
    if (circuitForm.sourceType === "link" && !isWebUrl(circuitForm.datasheetUrl)) {
      notifyUser("Enlace no válido", "Agrega un enlace http:// o https:// a la ficha técnica.");
      return;
    }
    const category = CIRCUIT_CATEGORIES.find((item) => item.id === circuitForm.category) || CIRCUIT_CATEGORIES[0];
    const previous = circuits.find((circuit) => String(circuit.id) === String(editingCircuitId));
    const circuit = {
      id: editingCircuitId || `custom-${Date.now()}`,
      custom: previous ? Boolean(previous.custom) : true,
      name,
      room: circuitForm.room.trim() || "Sin habitación",
      category: category.id,
      icon: category.icon,
      brand: circuitForm.brand.trim(),
      model: circuitForm.model.trim(),
      power: nominalPower,
      voltage,
      current: enteredCurrent || +(nominalPower / voltage).toFixed(2),
      breaker: breaker || null,
      anomalyThreshold: individualThreshold,
      essential: Boolean(circuitForm.essential),
      on: previous?.on ?? false,
      adminLocked: Boolean(previous?.adminLocked),
      adminDecisionAt: previous?.adminDecisionAt || null,
      adminProfileId: previous?.adminProfileId || null,
      controlUpdatedAt: previous?.controlUpdatedAt || null,
      lastControlCommandId: previous?.lastControlCommandId || null,
      sourceType: circuitForm.sourceType,
      sourceText: circuitForm.sourceText.trim(),
      photoUri: circuitForm.photoUri,
      datasheetUrl: circuitForm.datasheetUrl.trim(),
      notes: circuitForm.notes.trim(),
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const catalogUpdatedAt = markCircuitCatalogUpdated();
    if (previous?.photoUri && previous.photoUri !== circuit.photoUri) removeStoredPhoto(previous.photoUri);
    if (editingCircuitId) {
      setCircuits((current) => current.map((item) => String(item.id) === String(editingCircuitId) ? circuit : item));
      setEventMessage(`${name}: información actualizada`);
      sendCommand({ type: "update_circuit", circuit, circuitCatalogUpdatedAt: catalogUpdatedAt });
      recordActivity("circuit", "Circuito actualizado", `${circuit.room} · ${nominalPower.toLocaleString("es-CL")} W · alerta ${individualThreshold.toLocaleString("es-CL")} W.`, { circuit });
    } else {
      setCircuits((current) => [...current, circuit]);
      setEventMessage(`${name}: circuito añadido`);
      sendCommand({ type: "add_circuit", circuit, circuitCatalogUpdatedAt: catalogUpdatedAt });
      recordActivity("circuit", "Circuito añadido", `${circuit.room} · ${nominalPower.toLocaleString("es-CL")} W.`, { circuit });
    }
    closeCircuitModal();
  };

  const deleteCircuit = () => {
    if (isChildProfile) return;
    const target = circuits.find((circuit) => String(circuit.id) === String(editingCircuitId));
    if (!target) return;
    confirmUser("Eliminar circuito", `¿Quieres eliminar “${target.name}”? También se quitarán sus horarios, permisos VoltKids y solicitudes pendientes.`, () => {
        const catalogUpdatedAt = markCircuitCatalogUpdated();
        removeStoredPhoto(target.photoUri);
        setCircuits((current) => current.filter((circuit) => String(circuit.id) !== String(editingCircuitId)));
        setSchedules((current) => current.filter((schedule) => String(schedule.circuitId) !== String(editingCircuitId)));
        delete schedulePhasesRef.current[String(editingCircuitId)];
        delete pendingCircuitCommandsRef.current[String(editingCircuitId)];
        const nextProfiles = profiles.map((profile) => profile.role === "child" ? {
          ...profile,
          allowedCircuitIds: (profile.allowedCircuitIds || []).filter((id) => String(id) !== String(editingCircuitId)),
          updatedAt: new Date().toISOString(),
        } : profile);
        const resolvedAt = new Date().toISOString();
        const nextRequests = permissionRequestsRef.current.map((request) => ["pending", "approved"].includes(request.status) && String(request.circuitId) === String(editingCircuitId)
          ? { ...request, status: "cancelled", resolvedAt, resolvedBy: activeProfile.id }
          : request);
        if (nextRequests.some((request, index) => request !== permissionRequestsRef.current[index])) {
          commitPermissionRequestsLocally(nextRequests, `${target.name}: solicitudes pendientes canceladas`);
        }
        commitProfiles(nextProfiles, `${target.name}: permisos familiares actualizados`);
        setEventMessage(`${target.name}: circuito eliminado`);
        sendCommand({ type: "delete_circuit", id: editingCircuitId, circuitCatalogUpdatedAt: catalogUpdatedAt });
        recordActivity("circuit", "Circuito eliminado", "Se eliminó definitivamente junto con horarios, permisos y solicitudes pendientes.", { circuit: target });
        closeCircuitModal();
    });
  };

  const duplicateCircuit = () => {
    if (isChildProfile) return;
    const target = circuits.find((circuit) => String(circuit.id) === String(editingCircuitId));
    if (!target) return;
    const timestamp = new Date().toISOString();
    const duplicate = {
      ...target,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      custom: true,
      name: `${target.name} · copia`.slice(0, 80),
      on: false,
      adminLocked: false,
      adminDecisionAt: null,
      adminProfileId: null,
      controlUpdatedAt: null,
      lastControlCommandId: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const catalogUpdatedAt = markCircuitCatalogUpdated();
    setCircuits((current) => [...current, duplicate]);
    sendCommand({ type: "add_circuit", circuit: duplicate, circuitCatalogUpdatedAt: catalogUpdatedAt });
    recordActivity("circuit", "Circuito duplicado", `Se creó ${duplicate.name} al final de la lista.`, { circuit: duplicate });
    closeCircuitModal();
  };

  const archiveCircuit = () => {
    if (isChildProfile) return;
    const target = circuits.find((circuit) => String(circuit.id) === String(editingCircuitId));
    if (!target) return;
    confirmChoice("Archivar circuito", `“${target.name}” dejará de aparecer en el control, pero conservará sus datos para recuperarlo después.`, "Archivar", () => {
      const archivedAt = new Date().toISOString();
      const catalogUpdatedAt = markCircuitCatalogUpdated();
      const archiveUpdatedAt = commitArchivedCircuits([...archivedCircuitsRef.current, { ...target, on: false, adminLocked: false, archivedAt }], `${target.name}: circuito archivado`);
      setCircuits((current) => current.filter((circuit) => String(circuit.id) !== String(target.id)));
      setSchedules((current) => current.filter((schedule) => String(schedule.circuitId) !== String(target.id)));
      delete schedulePhasesRef.current[String(target.id)];
      const nextProfiles = profilesRef.current.map((profile) => profile.role === "child" ? { ...profile, allowedCircuitIds: (profile.allowedCircuitIds || []).filter((id) => String(id) !== String(target.id)), updatedAt: archivedAt } : profile);
      const nextRequests = permissionRequestsRef.current.map((request) => ["pending", "approved"].includes(request.status) && String(request.circuitId) === String(target.id)
        ? { ...request, status: "cancelled", resolvedAt: archivedAt, resolvedBy: activeProfile.id }
        : request);
      if (nextRequests.some((request, index) => request !== permissionRequestsRef.current[index])) commitPermissionRequestsLocally(nextRequests, `${target.name}: permisos temporales cancelados al archivar`);
      commitProfiles(nextProfiles, `${target.name}: permisos retirados al archivar`);
      sendCommand({ type: "archive_circuit", id: target.id, archivedCircuit: { ...target, on: false, adminLocked: false, archivedAt }, circuitCatalogUpdatedAt: catalogUpdatedAt, archivedCircuitsUpdatedAt: archiveUpdatedAt });
      recordActivity("circuit", "Circuito archivado", "Se conservaron los datos técnicos; horarios y permisos deberán revisarse al restaurarlo.", { circuit: target });
      closeCircuitModal();
    });
  };

  const restoreArchivedCircuit = (target) => {
    if (isChildProfile || !target) return;
    const restored = { ...target, on: false, adminLocked: false, archivedAt: null, updatedAt: new Date().toISOString() };
    const catalogUpdatedAt = markCircuitCatalogUpdated();
    const archiveUpdatedAt = commitArchivedCircuits(archivedCircuitsRef.current.filter((circuit) => String(circuit.id) !== String(target.id)), `${target.name}: circuito restaurado`);
    setCircuits((current) => [...current, restored]);
    sendCommand({ type: "restore_circuit", circuit: restored, circuitCatalogUpdatedAt: catalogUpdatedAt, archivedCircuitsUpdatedAt: archiveUpdatedAt });
    recordActivity("circuit", "Circuito restaurado", "Volvió al final de la lista en estado apagado.", { circuit: restored });
  };

  const deleteArchivedCircuit = (target) => {
    if (isChildProfile || !target) return;
    confirmUser("Eliminar circuito archivado", `¿Quieres borrar definitivamente “${target.name}”?`, () => {
      removeStoredPhoto(target.photoUri);
      const archiveUpdatedAt = commitArchivedCircuits(archivedCircuitsRef.current.filter((circuit) => String(circuit.id) !== String(target.id)), `${target.name}: eliminado del archivo`);
      sendCommand({ type: "delete_archived_circuit", id: target.id, archivedCircuitsUpdatedAt: archiveUpdatedAt });
      recordActivity("circuit", "Circuito archivado eliminado", "El respaldo técnico fue eliminado definitivamente.", { circuit: target });
    });
  };

  const updateScheduleForm = (field, value) => setScheduleForm((currentForm) => ({ ...currentForm, [field]: value }));
  const toggleScheduleDay = (day) => setScheduleForm((currentForm) => ({
    ...currentForm,
    days: currentForm.days.includes(day) ? currentForm.days.filter((value) => value !== day) : [...currentForm.days, day],
  }));
  const openNewSchedule = (circuitId = null) => {
    if (isChildProfile) return;
    setScheduleForm({ ...defaultSchedule(circuits), circuitId: circuitId ?? circuits[0]?.id ?? null });
    setScheduleModalVisible(true);
  };
  const openEditSchedule = (schedule) => {
    if (isChildProfile) return;
    setScheduleForm({ ...schedule, days: [...(schedule.days || [])] });
    setScheduleModalVisible(true);
  };
  const closeScheduleModal = () => {
    setScheduleModalVisible(false);
    setScheduleForm(defaultSchedule(circuits));
  };
  const saveSchedule = () => {
    if (isChildProfile) return;
    if (!scheduleForm.circuitId || !circuits.some((circuit) => String(circuit.id) === String(scheduleForm.circuitId))) {
      notifyUser("Falta el circuito", "Selecciona el circuito que será controlado.");
      return;
    }
    if (!isValidTime(scheduleForm.start) || !isValidTime(scheduleForm.end) || scheduleForm.start === scheduleForm.end) {
      notifyUser("Horario no válido", "Usa el formato HH:MM y define horas diferentes para encendido y apagado.");
      return;
    }
    if (!scheduleForm.days.length) {
      notifyUser("Faltan los días", "Selecciona al menos un día de funcionamiento.");
      return;
    }
    const schedule = {
      ...scheduleForm,
      id: scheduleForm.id || `schedule-${Date.now()}`,
      days: [...scheduleForm.days].sort((a, b) => a - b),
      updatedAt: new Date().toISOString(),
    };
    const previousSchedule = schedules.find((item) => String(item.id) === String(schedule.id));
    if (previousSchedule) delete schedulePhasesRef.current[String(previousSchedule.circuitId)];
    delete schedulePhasesRef.current[String(schedule.circuitId)];
    setSchedules((current) => current.some((item) => item.id === schedule.id)
      ? current.map((item) => item.id === schedule.id ? schedule : item)
      : [...current, schedule]);
    sendCommand({ type: "set_schedule", schedule });
    const circuit = circuits.find((item) => String(item.id) === String(schedule.circuitId));
    setEventMessage(`${circuit?.name || "Circuito"}: horario guardado`);
    recordActivity("circuit", previousSchedule ? "Horario actualizado" : "Horario añadido", `${schedule.start}–${schedule.end} · ${scheduleDaysLabel(schedule.days)}.`, { circuit });
    closeScheduleModal();
  };
  const deleteSchedule = () => {
    if (isChildProfile) return;
    if (!scheduleForm.id) return;
    confirmUser("Eliminar temporizador", "¿Quieres quitar esta programación horaria?", () => {
      const deletedSchedule = schedules.find((schedule) => String(schedule.id) === String(scheduleForm.id));
      if (deletedSchedule) delete schedulePhasesRef.current[String(deletedSchedule.circuitId)];
      setSchedules((current) => current.filter((schedule) => schedule.id !== scheduleForm.id));
      sendCommand({ type: "delete_schedule", id: scheduleForm.id });
      const circuit = circuits.find((item) => String(item.id) === String(deletedSchedule?.circuitId));
      recordActivity("circuit", "Horario eliminado", deletedSchedule ? `${deletedSchedule.start}–${deletedSchedule.end}.` : "Programación retirada.", { circuit });
      closeScheduleModal();
    });
  };
  const toggleScheduleEnabled = (schedule) => {
    if (isChildProfile) return;
    const updated = { ...schedule, enabled: !schedule.enabled, updatedAt: new Date().toISOString() };
    delete schedulePhasesRef.current[String(schedule.circuitId)];
    setSchedules((current) => current.map((item) => item.id === schedule.id ? updated : item));
    sendCommand({ type: "set_schedule", schedule: updated });
    const circuit = circuits.find((item) => String(item.id) === String(schedule.circuitId));
    recordActivity("circuit", updated.enabled ? "Horario habilitado" : "Horario pausado", `${updated.start}–${updated.end}.`, { circuit });
  };

  const activeCircuits = circuits.filter((circuit) => circuit.on);
  const essentialCircuits = circuits.filter((circuit) => circuit.essential);
  const pendingPermissionRequests = permissionRequests.filter((request) => request.status === "pending");
  const managedProfiles = userMode === "technical" ? profiles.filter((profile) => profile.role === "normal") : profiles;
  const activeProfilePermissionRequests = permissionRequests.filter((request) => request.profileId === activeProfile.id);
  const unavailableProfileCircuits = isChildProfile ? circuits.filter((circuit) => !allowedCircuitIds.has(String(circuit.id))) : [];
  const childMissionRecords = Object.values(kidsMissions).filter((mission) => mission.profileId === activeProfile.id);
  const childMissionWh = childMissionRecords.reduce((sum, mission) => sum + Number(mission.estimatedWh || 0), 0);
  const unlockedEcoBadges = ECO_BADGES.filter((badge) => childMissionRecords.length >= badge.min);
  const activeEssentialPower = circuits.reduce((sum, circuit) => sum + (circuit.on && circuit.essential ? circuit.power : 0), 0);
  const effectiveBatteryCapacity = BATTERY_CAPACITY_KWH * Math.max(0, Math.min(100, batteryHealth)) / 100;
  const estimatedRuntime = activeEssentialPower > 0
    ? (effectiveBatteryCapacity * (battery / 100) * 0.9) / (activeEssentialPower / 1000) : 0;
  const estimatedChargeTime = battery < 100
    ? (effectiveBatteryCapacity * (1 - battery / 100)) / BATTERY_CHARGE_POWER_KW : 0;
  const batteryHealthLabel = batteryHealth >= 90 ? "Excelente"
    : batteryHealth >= 75 ? "Buena" : batteryHealth >= 60 ? "Requiere revisión" : "Reemplazo recomendado";
  const batteryHealthColor = batteryHealth >= 90 ? theme.success : batteryHealth >= 75 ? theme.accentBright : batteryHealth >= 60 ? theme.warning : theme.danger;
  const cost = Math.round(energy * tariff);
  const current = power / Math.max(voltage, 1);
  const visibleHistory = useMemo(() => filterHistory(historyRecords, selectedPeriod), [historyRecords, selectedPeriod]);
  const periodConsumption = visibleHistory.reduce((sum, item) => sum + Number(item.consumption || 0), 0);
  const periodCost = visibleHistory.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const periodLabel = PERIOD_OPTIONS.find((period) => period.id === selectedPeriod)?.label || "1 mes";
  const analyses = useMemo(() => {
    const liveValues = { voltage, current, power, consumption: periodConsumption, cost: periodCost, tariff };
    return Object.keys(METRIC_DEFINITIONS).reduce((result, metricId) => {
      const analysis = getMetricAnalysis(metricId, visibleHistory, liveValues, anomalyPowerThreshold);
      const remote = serverAnomalies.filter((anomaly) => metricId === "cost" ? anomaly.metric === "consumption" : anomaly.metric === metricId);
      const allAnomalies = [...remote, ...analysis.anomalies].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      result[metricId] = { ...analysis, anomalies: allAnomalies, lastAnomaly: allAnomalies[0] || null };
      return result;
    }, {});
  }, [anomalyPowerThreshold, current, periodConsumption, periodCost, power, serverAnomalies, tariff, visibleHistory, voltage]);
  const anomalyCatalog = useMemo(() => {
    const catalog = new Map();
    const circuitThresholdAnomalies = circuits.filter((circuit) => circuit.on && Number(circuit.anomalyThreshold) > 0 && Number(circuit.power) >= Number(circuit.anomalyThreshold)).map((circuit) => ({
      timestamp: circuit.controlUpdatedAt || circuit.updatedAt || "2026-08-24T00:00:00.000Z",
      metric: "consumption",
      type: `Límite individual · ${circuit.name}`,
      value: Number(circuit.power || 0),
      unit: "W",
      severity: Number(circuit.power) >= Number(circuit.anomalyThreshold) * 1.25 ? "critical" : "warning",
      details: `${circuit.name} está activo con ${Number(circuit.power || 0).toLocaleString("es-CL")} W y su límite individual es ${Number(circuit.anomalyThreshold).toLocaleString("es-CL")} W.`,
      circuitId: circuit.id,
    }));
    [...detectAnomalies(visibleHistory, anomalyPowerThreshold), ...serverAnomalies, ...circuitThresholdAnomalies].forEach((anomaly) => {
      const key = anomalyRecordKey(anomaly);
      const previous = catalog.get(key) || {};
      const review = anomalyReviews[key] || {};
      catalog.set(key, {
        ...previous,
        ...anomaly,
        key,
        guidance: getAnomalyGuidance(anomaly),
        status: review.status || "open",
        note: review.note || "",
        reviewUpdatedAt: review.updatedAt || null,
        reviewedBy: review.reviewedBy || null,
      });
    });
    return [...catalog.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [anomalyPowerThreshold, anomalyReviews, circuits, serverAnomalies, visibleHistory]);
  const filteredAnomalies = useMemo(() => anomalyCatalog.filter((anomaly) => {
    const folderMatches = anomalyFolder === "resolved" ? anomaly.status === "resolved" : anomaly.status !== "resolved";
    const metricMatches = anomalyMetricFilter === "all" || anomaly.metric === anomalyMetricFilter;
    const statusMatches = anomalyStatusFilter === "all" || anomaly.status === anomalyStatusFilter;
    return folderMatches && metricMatches && statusMatches;
  }), [anomalyCatalog, anomalyFolder, anomalyMetricFilter, anomalyStatusFilter]);
  const anomalySummary = useMemo(() => ({
    total: anomalyCatalog.length,
    active: anomalyCatalog.filter((anomaly) => anomaly.status !== "resolved").length,
    critical: anomalyCatalog.filter((anomaly) => anomaly.status !== "resolved" && anomaly.severity === "critical").length,
    open: anomalyCatalog.filter((anomaly) => anomaly.status === "open").length,
    reviewed: anomalyCatalog.filter((anomaly) => anomaly.status === "reviewed").length,
    resolved: anomalyCatalog.filter((anomaly) => anomaly.status === "resolved").length,
  }), [anomalyCatalog]);
  const completedMaintenance = MAINTENANCE_TASKS.filter((task) => maintenanceChecks[task.id]).length;
  const diagnosticRecords = Object.values(circuitDiagnostics).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const unifiedNotifications = useMemo(() => {
    const items = [];
    if (anomalySummary.critical > 0) items.push({ id: "critical-anomalies", category: "Anomalías", title: `${anomalySummary.critical} anomalía${anomalySummary.critical === 1 ? " crítica" : "s críticas"}`, text: "Revisa valores, causas y seguimiento antes de cerrar el aviso.", severity: "critical", icon: "warning", action: "anomalies" });
    else if (anomalySummary.active > 0) items.push({ id: "active-anomalies", category: "Anomalías", title: `${anomalySummary.active} evento${anomalySummary.active === 1 ? "" : "s"} en revisión`, text: "Los eventos resueltos permanecen en el archivo de anomalías.", severity: "warning", icon: "pulse-outline", action: "anomalies" });
    if (userMode !== "technical" && !isChildProfile && pendingPermissionRequests.length > 0) items.push({ id: "permission-requests", category: "VoltKids", title: `${pendingPermissionRequests.length} solicitud${pendingPermissionRequests.length === 1 ? " pendiente" : "es pendientes"}`, text: "Puedes autorizar una vez, durante una hora o permanentemente.", severity: "warning", icon: "happy-outline", action: "permissions" });
    if (connection === "offline") items.push({ id: "connection-offline", category: "Sistema", title: "Servidor sin conexión", text: "Los cambios quedan locales y se enviarán al recuperar el enlace.", severity: "critical", icon: "cloud-offline-outline", action: "reconnect" });
    if (diagnosticRecords.length > 0) items.push({ id: "circuit-diagnostics", category: "Circuitos", title: `${diagnosticRecords.length} diagnóstico${diagnosticRecords.length === 1 ? " disponible" : "s disponibles"}`, text: diagnosticRecords[0]?.reason || "Una orden recibió un estado diferente.", severity: "warning", icon: "search-outline", action: "activity" });
    if (userMode === "technical" && completedMaintenance < MAINTENANCE_TASKS.length) items.push({ id: "maintenance-checklist", category: "Mantenimiento", title: `${MAINTENANCE_TASKS.length - completedMaintenance} verificaciones pendientes`, text: "Completa o revisa la lista antes de finalizar la sesión técnica.", severity: "warning", icon: "checkbox-outline", action: "maintenance" });
    return items;
  }, [anomalySummary.active, anomalySummary.critical, completedMaintenance, connection, diagnosticRecords.length, isChildProfile, pendingPermissionRequests.length, userMode]);
  const openUnifiedNotification = (notification) => {
    setNotificationCenterVisible(false);
    if (notification.action === "anomalies") setAnomalyCenterVisible(true);
    else if (notification.action === "permissions") openPermissionCenter();
    else if (notification.action === "activity") setActivityLogVisible(true);
    else if (notification.action === "reconnect") reconnectNow();
    else if (notification.action === "maintenance") setScreen("inicio");
  };
  const recommendations = useMemo(() => getRecommendations(circuits, schedules, visibleHistory, power, BATTERY_CAPACITY_KWH, anomalyPowerThreshold), [anomalyPowerThreshold, circuits, schedules, visibleHistory, power]);
  const introRoute = isChildProfile ? CHILD_INTRO_MISSIONS : ADMIN_INTRO_MISSIONS;
  const activeIntroProgress = introProgress[activeProfile.id] || { completed: [], techCompleted: [], skipped: false, updatedAt: null };
  const introCompletedSet = new Set(activeIntroProgress.completed || []);
  const introCompletedCount = introRoute.filter((mission) => introCompletedSet.has(mission.id)).length;
  const introRouteCompleted = Boolean(activeIntroProgress.skipped) || introCompletedCount === introRoute.length;
  const introStage = activeIntroProgress.skipped ? 1
    : introRoute.filter((mission) => mission.stage === 3).every((mission) => introCompletedSet.has(mission.id))
      ? introRoute.filter((mission) => mission.stage === 2).every((mission) => introCompletedSet.has(mission.id)) ? 1 : 2
      : 3;
  const applyInformationPreset = (preset, profileId = activeProfile.id) => {
    const normalizedPreset = ["1", "2", "3"].includes(String(preset)) ? String(preset) : "1";
    setInformationProfiles((current) => ({ ...current, [profileId]: { preset: normalizedPreset, modules: informationModulesForPreset(normalizedPreset), updatedAt: new Date().toISOString() } }));
  };
  const toggleInformationModule = (moduleId) => {
    const currentModules = { ...informationModulesForPreset(currentInformationPreset), ...(currentInformationSetting.modules || {}) };
    currentModules[moduleId] = !showInformationModule(moduleId);
    setInformationProfiles((current) => ({ ...current, [activeProfile.id]: { preset: "custom", modules: currentModules, updatedAt: new Date().toISOString() } }));
  };
  const openMissionTarget = (mission) => {
    if (mission.target === "anomalies") { setAnomalyCenterVisible(true); return; }
    if (mission.target === "tutorial") { setTutorialTabVisible(true); setScreen("tutorial"); return; }
    if (["inicio", "circuitos", "energia", "respaldo", "ajustes"].includes(mission.target)) setScreen(mission.target);
  };
  const completeIntroMission = (mission, technicalMission = false) => {
    const currentEntry = introProgress[activeProfile.id] || { completed: [], techCompleted: [], skipped: false, updatedAt: null };
    const key = technicalMission ? "techCompleted" : "completed";
    const nextList = [...new Set([...(currentEntry[key] || []), mission.id])];
    const nextEntry = { ...currentEntry, [key]: nextList, skipped: technicalMission ? currentEntry.skipped : false, updatedAt: new Date().toISOString() };
    setIntroProgress((current) => ({ ...current, [activeProfile.id]: nextEntry }));
    if (!technicalMission) {
      const completed = new Set(nextList);
      const stageFinished = introRoute.filter((item) => item.stage === mission.stage).every((item) => completed.has(item.id));
      if (stageFinished && mission.stage === 3) {
        applyInformationPreset("2");
        notifyUser("Perfil de información 2 desbloqueado", "Ahora VoltKey mostrará más datos y el módulo Respaldo. Las nuevas misiones explicarán estos bloques.");
      } else if (stageFinished && mission.stage === 2) {
        applyInformationPreset("1");
        notifyUser("Perfil de información 1 desbloqueado", "Ya puedes ver toda la información. Las siguientes misiones presentan Energía, anomalías y personalización.");
      }
      if (introRoute.every((item) => completed.has(item.id)) && !isChildProfile) notifyUser("Ruta Administrador completada", "Desbloqueaste la ruta de logros VoltKey Tec dentro del Tutorial.");
    }
    setEventMessage(`Logro desbloqueado: ${mission.achievement}`);
  };
  const skipMissionIntroduction = () => {
    const updatedAt = new Date().toISOString();
    setIntroProgress((current) => ({ ...current, [activeProfile.id]: { ...(current[activeProfile.id] || {}), completed: current[activeProfile.id]?.completed || [], techCompleted: current[activeProfile.id]?.techCompleted || [], skipped: true, updatedAt } }));
    applyInformationPreset("1");
    AsyncStorage.setItem("voltkey.onboarding210Completed", "1").catch(() => {});
    setMissionIntroVisible(false);
    setEventMessage("Introducción omitida · información completa habilitada");
  };
  const startMissionIntroduction = () => {
    const updatedAt = new Date().toISOString();
    setIntroProgress((current) => ({ ...current, [activeProfile.id]: { completed: current[activeProfile.id]?.completed || [], techCompleted: current[activeProfile.id]?.techCompleted || [], skipped: false, updatedAt } }));
    applyInformationPreset("3");
    AsyncStorage.setItem("voltkey.onboarding210Completed", "1").catch(() => {});
    setMissionIntroVisible(false);
    setTutorialTabVisible(true);
    setScreen("tutorial");
  };
  const resetMissionIntroduction = () => {
    setIntroProgress((current) => ({ ...current, [activeProfile.id]: { completed: [], techCompleted: [], skipped: false, updatedAt: new Date().toISOString() } }));
    applyInformationPreset("3");
    setTutorialTabVisible(true);
    setScreen("tutorial");
    setEventMessage("Ruta de introducción reiniciada");
  };
  const InformationPreferencesPanel = ({ child = false } = {}) => {
    const allowedCategories = INFORMATION_CATEGORIES.filter((category) => !child || ["inicio", "circuitos"].includes(category.id));
    const selectedCategory = allowedCategories.some((category) => category.id === infoSettingsTab) ? infoSettingsTab : allowedCategories[0]?.id || "inicio";
    const modules = INFORMATION_MODULES.filter((module) => module.category === selectedCategory && (!child || module.child || module.id === "circuits.search"));
    return <>
      <SectionTitle title="INFORMACIÓN VISIBLE" caption={`Preferencias de ${activeProfile.name} · cada perfil guarda su propia configuración`} icon="eye-outline" styles={styles} theme={theme} />
      <Panel styles={styles}>
        <Text style={styles.filterLabel}>PERFILES PREEDITADOS</Text>
        <View style={styles.modeGrid}>{INFORMATION_PRESETS.map((preset) => {
          const selected = currentInformationSetting.preset === preset.id;
          return <Pressable key={preset.id} accessibilityLabel={`Perfil de información ${preset.label}`} onPress={() => applyInformationPreset(preset.id)} style={({ pressed }) => [styles.modeOption, selected && styles.optionSelected, pressed && styles.pressed]}><View style={[styles.modeIcon, selected && styles.modeIconSelected]}><Ionicons name={preset.icon} size={23} color={selected ? theme.accentBright : theme.muted} /></View><Text style={styles.modeTitle}>{preset.label}</Text><Text style={styles.modeDescription}>{preset.description}</Text><View style={styles.modeSelectedRow}><Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.modeSelectedText, selected && { color: theme.accentBright }]}>{selected ? "ACTIVO" : "USAR PERFIL"}</Text></View></Pressable>;
        })}</View>
        {currentInformationSetting.preset === "custom" && <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="options-outline" size={21} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>PERSONALIZADO · Cambiaste elementos manualmente. Puedes volver a cualquiera de los perfiles 1, 2 o 3 cuando quieras.</Text></Panel>}
        <Text style={styles.filterLabel}>SUBPESTAÑAS DE INFORMACIÓN</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomFilterRow}>{allowedCategories.map((category) => {
          const selected = selectedCategory === category.id;
          return <Pressable key={category.id} accessibilityLabel={`Configurar información de ${category.label}`} onPress={() => setInfoSettingsTab(category.id)} style={({ pressed }) => [styles.filterChip, selected && styles.filterChipActive, pressed && styles.pressed]}><Ionicons name={category.icon} size={15} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{category.label.toUpperCase()}</Text></Pressable>;
        })}</ScrollView>
        {modules.map((module, index) => <View key={module.id}>{index > 0 && <View style={styles.separator} />}<View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={showInformationModule(module.id) ? "eye-outline" : "eye-off-outline"} size={21} color={showInformationModule(module.id) ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>{module.label.toUpperCase()}</Text><Text style={styles.formSwitchHelp}>{module.description}</Text></View><Switch value={showInformationModule(module.id)} onValueChange={() => toggleInformationModule(module.id)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={showInformationModule(module.id) ? theme.accentBright : theme.muted} /></View></View>)}
        <Pressable accessibilityLabel="Abrir misiones de introducción" onPress={() => { setTutorialTabVisible(true); setScreen("tutorial"); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="trophy-outline" size={19} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>ABRIR MISIONES Y LOGROS</Text></Pressable>
      </Panel>
    </>;
  };
  const baseNavigationItems = isChildProfile ? CHILD_NAV_ITEMS : userMode === "technical" ? NAV_ITEMS : NAV_ITEMS.filter((item) => {
    if (currentInformationSetting.preset === "custom" || currentInformationPreset === "1") return true;
    if (currentInformationPreset === "2") return item.id !== "energia";
    return ["inicio", "circuitos", "ajustes"].includes(item.id);
  });
  const navigationItems = [...baseNavigationItems, ...(tutorialTabVisible ? [TUTORIAL_NAV_ITEM] : [])];
  const connectionQuality = connection !== "online" ? "Sin enlace"
    : latency === null ? "Midiendo"
      : latency < 180 ? "Estable" : latency < 600 ? "Poco estable" : "Inestable";
  const technicalAnomalies = new Set(Object.values(analyses).flatMap((analysis) => analysis.anomalies || [])
    .map((anomaly) => `${anomaly.timestamp}|${anomaly.metric}|${anomaly.type}`)).size;
  const voltageDeviation = ((voltage - 220) / 220) * 100;
  const saveAnomalyThreshold = () => {
    if (isChildProfile) return;
    const threshold = Math.round(Number(anomalyThresholdInput));
    if (!Number.isFinite(threshold) || threshold < MIN_ANOMALY_POWER_THRESHOLD || threshold > MAX_ANOMALY_POWER_THRESHOLD) {
      notifyUser("Límite no válido", `Ingresa un valor entre ${MIN_ANOMALY_POWER_THRESHOLD.toLocaleString("es-CL")} y ${MAX_ANOMALY_POWER_THRESHOLD.toLocaleString("es-CL")} W.`);
      return;
    }
    const updatedAt = new Date().toISOString();
    setAnomalyPowerThreshold(threshold);
    setAnomalyThresholdInput(String(threshold));
    setAnomalySettingsUpdatedAt(updatedAt);
    sendCommand({ type: "set_anomaly_settings", anomalyPowerThreshold: threshold, anomalySettingsUpdatedAt: updatedAt });
    setEventMessage(`Alerta de potencia configurada en ${threshold.toLocaleString("es-CL")} W`);
    notifyUser("Límite actualizado", `VoltKey alertará al alcanzar ${threshold.toLocaleString("es-CL")} W.`);
  };
  const saveAnomalyReview = (anomaly, status, note) => {
    if (isChildProfile || !anomaly?.key) return;
    const updatedAt = new Date().toISOString();
    const review = {
      status: ["open", "reviewed", "resolved"].includes(status) ? status : "open",
      note: String(note || "").trim().slice(0, 500),
      updatedAt,
      reviewedBy: activeProfile.id,
    };
    const nextReviews = normalizeAnomalyReviews({ ...anomalyReviews, [anomaly.key]: review });
    setAnomalyReviews(nextReviews);
    setAnomalyReviewsUpdatedAt(updatedAt);
    sendCommand({ type: "set_anomaly_review", key: anomaly.key, review, anomalyReviewsUpdatedAt: updatedAt });
    recordActivity("security", review.status === "resolved" ? "Anomalía resuelta" : "Seguimiento de anomalía actualizado", `${anomaly.type}${review.note ? ` · ${review.note}` : ""}.`, { circuitId: anomaly.circuitId || null, circuitName: anomaly.circuitName || null });
    setSelectedAnomaly(null);
    setEventMessage(`${anomaly.type}: ${review.status === "resolved" ? "archivada en Resueltas" : "seguimiento guardado"}`);
  };
  const downloadHistory = async () => {
    if (!visibleHistory.length) {
      notifyUser("Sin historial", "No existen registros para el periodo seleccionado.");
      return;
    }
    try {
      setExporting(true);
      const result = await exportEnergyWorkbook({ records: visibleHistory, circuits, schedules, anomalies: anomalyCatalog, periodLabel, tariff, source: historySource });
      notifyUser("Excel preparado", `${result.fileName}\n${result.rows} registros incluidos.`);
    } catch (error) {
      notifyUser("No se pudo crear el Excel", error?.message || "Intenta nuevamente.");
    } finally {
      setExporting(false);
    }
  };

  const buildConfigurationBackup = () => ({
    voltkeyBackup: true,
    schema: "voltkey-config-v1",
    appVersion: RELEASE_VERSION,
    firmwareBaseVersion: APP_VERSION,
    arduinoTestVersion: ARDUINO_TEST_VERSION,
    createdAt: new Date().toISOString(),
    circuits,
    archivedCircuits,
    schedules,
    profiles,
    anomalyReviews,
    anomalyPowerThreshold,
    permissionRequests,
    kidsMissions,
    introProgress,
    informationProfiles,
    settings: { paletteId, kidsThemeId, fontId, layoutMode, circuitViewMode, soundsEnabled, hapticsEnabled, tutorialTabVisible },
  });

  const configurationBackupText = () => JSON.stringify(buildConfigurationBackup(), null, 2);

  const exportConfigurationBackup = async () => {
    try {
      const textValue = configurationBackupText();
      const fileName = `VoltKey-Respaldo-${new Date().toISOString().slice(0, 10)}.json`;
      if (Platform.OS === "web" && globalThis.document && globalThis.Blob && globalThis.URL) {
        const url = globalThis.URL.createObjectURL(new Blob([textValue], { type: "application/json" }));
        const anchor = globalThis.document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.click();
        globalThis.URL.revokeObjectURL(url);
      } else {
        const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
        if (!directory) throw new Error("No existe una carpeta disponible para crear el respaldo.");
        const uri = `${directory}${fileName}`;
        await FileSystem.writeAsStringAsync(uri, textValue, { encoding: FileSystem.EncodingType.UTF8 });
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Guardar respaldo de VoltKey" });
        else notifyUser("Respaldo preparado", uri);
      }
      recordActivity("system", "Copia de seguridad creada", `${circuits.length} circuitos, ${profiles.length} perfiles y ${schedules.length} horarios.`);
      setEventMessage("Copia de seguridad preparada");
    } catch (error) {
      notifyUser("No se pudo crear el respaldo", error?.message || "Intenta nuevamente.");
    }
  };

  const restoreConfigurationBackup = () => {
    let backup;
    try { backup = JSON.parse(backupRestoreText); }
    catch { notifyUser("Respaldo no válido", "El contenido no es un archivo JSON válido."); return; }
    const hasCircuitCatalog = Array.isArray(backup?.circuits) && backup.circuits.length > 0;
    const nextCircuits = normalizeArduinoTestCircuits(backup?.circuits);
    const nextProfiles = normalizeProfiles(backup?.profiles).map((profile) => profile.role === "child" ? {
      ...profile,
      allowedCircuitIds: (profile.allowedCircuitIds || []).filter((id) => ["1", "2", "3"].includes(String(id))),
    } : profile);
    if (backup?.voltkeyBackup !== true || backup?.schema !== "voltkey-config-v1" || !hasCircuitCatalog || !nextProfiles.some((profile) => profile.role === "normal")) {
      notifyUser("Respaldo incompatible", "VoltKey no encontró circuitos válidos o un perfil administrador dentro del respaldo.");
      return;
    }
    confirmChoice("¿Restaurar configuración?", "Se reemplazarán circuitos, perfiles, horarios y preferencias. La configuración actual quedará conservada temporalmente durante esta sesión.", "Restaurar", () => {
      preRestoreBackupRef.current = buildConfigurationBackup();
      const updatedAt = new Date().toISOString();
      setCircuits(nextCircuits);
      setCircuitCatalogUpdatedAt(updatedAt);
      setArchivedCircuits([]);
      setArchivedCircuitsUpdatedAt(updatedAt);
      setSchedules(Array.isArray(backup.schedules) ? backup.schedules.filter((schedule) => ["1", "2", "3"].includes(String(schedule?.circuitId))) : []);
      setProfiles(nextProfiles);
      setProfilesUpdatedAt(updatedAt);
      setActiveProfileId(nextProfiles.find((profile) => profile.role === "normal")?.id || nextProfiles[0].id);
      setAnomalyReviews(normalizeAnomalyReviews(backup.anomalyReviews));
      setAnomalyReviewsUpdatedAt(updatedAt);
      const restoredThreshold = Number(backup.anomalyPowerThreshold);
      if (restoredThreshold >= MIN_ANOMALY_POWER_THRESHOLD && restoredThreshold <= MAX_ANOMALY_POWER_THRESHOLD) {
        setAnomalyPowerThreshold(restoredThreshold);
        setAnomalyThresholdInput(String(restoredThreshold));
        setAnomalySettingsUpdatedAt(updatedAt);
      }
      setPermissionRequests(normalizePermissionRequests(backup.permissionRequests));
      setPermissionRequestsUpdatedAt(updatedAt);
      setKidsMissions(normalizeKidsMissions(backup.kidsMissions));
      setKidsMissionsUpdatedAt(updatedAt);
      if (backup.introProgress) setIntroProgress(normalizeIntroProgress(backup.introProgress));
      if (backup.informationProfiles) setInformationProfiles(normalizeInformationProfiles(backup.informationProfiles));
      if (backup.settings?.paletteId && PALETTES[backup.settings.paletteId]) setPaletteId(backup.settings.paletteId);
      if (backup.settings?.kidsThemeId && KIDS_PALETTES[backup.settings.kidsThemeId]) setKidsThemeId(backup.settings.kidsThemeId);
      if (backup.settings?.fontId && FONT_PRESETS[backup.settings.fontId]) setFontId(backup.settings.fontId);
      if (["auto", "mobile", "desktop"].includes(backup.settings?.layoutMode)) setLayoutMode(backup.settings.layoutMode);
      if (["detail", "large"].includes(backup.settings?.circuitViewMode)) setCircuitViewMode(backup.settings.circuitViewMode);
      if (typeof backup.settings?.soundsEnabled === "boolean") onSoundsEnabledChange(backup.settings.soundsEnabled);
      if (typeof backup.settings?.hapticsEnabled === "boolean") onHapticsEnabledChange(backup.settings.hapticsEnabled);
      if (typeof backup.settings?.tutorialTabVisible === "boolean") setTutorialTabVisible(backup.settings.tutorialTabVisible);
      sendCommand({ type: "restore_backup", backup: { ...backup, circuits: nextCircuits, profiles: nextProfiles }, restoredAt: updatedAt });
      recordActivity("system", "Copia de seguridad restaurada", `${nextCircuits.length} circuitos y ${nextProfiles.length} perfiles recuperados.`);
      setBackupRestoreVisible(false);
      setBackupRestoreText("");
      setEventMessage("Configuración restaurada correctamente");
      notifyUser("Restauración completada", "Revisa circuitos, permisos VoltKids y horarios antes de controlar una instalación real.");
    });
  };

  const closeTutorial = () => {
    setTutorialVisible(false);
    setTutorialStep(0);
    AsyncStorage.setItem("voltkey.onboarding111Completed", "1").catch(() => {});
    AsyncStorage.setItem("voltkey.onboardingArduinoTest11Completed", "1").catch(() => {});
    AsyncStorage.setItem("voltkey.onboardingArduinoTest12Completed", "1").catch(() => {});
  };

  if (!fontsLoaded || !preferencesLoaded) {
    return <View style={{ flex: 1, backgroundColor: PALETTES.starter.bg, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={PALETTES.starter.accent} size="large" /></View>;
  }
  if (showIntro) return <IntroScreen styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} onContinue={() => setShowIntro(false)} />;

  const ChildHomeScreen = () => {
    const hackerMode = kidsThemeId === "hacker";
    const estimatedAmps = power / Math.max(voltage, 1);
    return <>
      <AppHeader title={hackerMode ? "TERMINAL VOLTKIDS" : "INICIO VOLTKIDS"} subtitle={hackerMode ? "Terminal educativa y permisos protegidos" : "Tus controles autorizados"} connection={connection} styles={styles} theme={theme} kids pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.childWelcomePanel} styles={styles}>
          <View style={styles.childWelcomeIcon}><Ionicons name={hackerMode ? "terminal" : "happy"} size={32} color={theme.accentBright} /></View>
          <View style={{ flex: 1 }}><Text style={styles.childWelcomeTitle}>{hackerMode ? "TERMINAL VOLTKIDS" : "MI CASA VOLTKIDS"}</Text><Text style={styles.childWelcomeText}>{hackerMode ? "Observa datos, aprende conceptos y solicita acceso. El administrador conserva siempre la decisión final." : "Toca un equipo para encender o apagar. Si aparece un candado, el administrador lo ha bloqueado."}</Text></View>
        </Panel>
        {showInformationModule("kids.themes") && <Panel styles={styles}>
          <Text style={styles.kidsThemeLabel}>ELIGE TU TEMA</Text>
          <View style={styles.kidsThemeGrid}>{Object.values(KIDS_PALETTES).map((kidsPalette) => {
            const selected = kidsThemeId === kidsPalette.id;
            return <Pressable key={kidsPalette.id} accessibilityLabel={`Tema VoltKids ${kidsPalette.name}`} onPress={() => changeKidsTheme(kidsPalette.id)} style={({ pressed }) => [styles.kidsThemeButton, selected && styles.kidsThemeButtonActive, pressed && styles.pressed]}>
              <View style={[styles.kidsThemeDot, { backgroundColor: kidsPalette.accentBright }]} />
              <Text style={[styles.kidsThemeButtonText, selected && { color: theme.accentBright }]}>{kidsPalette.name.toUpperCase()}</Text>
              <Ionicons name={selected ? "checkmark-circle" : "ellipse-outline"} size={17} color={selected ? theme.accentBright : theme.muted} />
            </Pressable>;
          })}</View>
        </Panel>}
        <SectionTitle title="MIS HABITACIONES" caption={`${profileCircuits.length} control${profileCircuits.length === 1 ? "" : "es"} disponible${profileCircuits.length === 1 ? "" : "s"}`} icon="bed-outline" styles={styles} theme={theme} />
        {profileCircuits.length ? <LargeCircuitGrid circuits={profileCircuits} cardInserted={cardInserted} gridAvailable={gridAvailable} onToggle={toggleCircuit} onPriority={toggleEssential} onEdit={openEditCircuit} onToggleLock={toggleCircuitLock} styles={styles} theme={theme} desktop={isDesktopLayout} restricted /> : <Panel style={styles.childEmptyPanel} styles={styles}><Ionicons name="lock-closed-outline" size={33} color={theme.muted} /><Text style={styles.childEmptyTitle}>AÚN NO HAY CONTROLES</Text><Text style={styles.childEmptyText}>Un administrador debe elegir qué circuitos puedes utilizar.</Text></Panel>}

        {hackerMode && showInformationModule("kids.learning") && <>
          <SectionTitle title="CONSOLA DE LA CASA" caption="Lecturas educativas en tiempo real · solo observación" icon="terminal-outline" styles={styles} theme={theme} />
          <View style={styles.hackerMetricGrid}>{[
            { label: "VOLTAJE", value: `${voltage.toFixed(1)} V`, icon: "pulse-outline" },
            { label: "POTENCIA", value: `${Math.round(power).toLocaleString("es-CL")} W`, icon: "flash-outline" },
            { label: "CORRIENTE EST.", value: `${estimatedAmps.toFixed(2)} A`, icon: "git-compare-outline" },
            { label: "ENLACE", value: connection === "online" ? "ONLINE" : connection === "local" ? "SIMULACIÓN" : "OFFLINE", icon: "wifi-outline" },
          ].map((item) => <Panel key={item.label} style={styles.hackerMetricCard} styles={styles}><Ionicons name={item.icon} size={20} color={theme.accentBright} /><Text style={styles.hackerMetricLabel}>{item.label}</Text><Text style={styles.hackerMetricValue}>{item.value}</Text></Panel>)}</View>

          <SectionTitle title="TERMINAL DE PERMISOS" caption="Pide acceso; nunca se activa sin aprobación" icon="key-outline" styles={styles} theme={theme} />
          {unavailableProfileCircuits.length ? <View style={styles.hackerPermissionList}>{unavailableProfileCircuits.map((circuit) => {
            const pending = activeProfilePermissionRequests.find((request) => request.status === "pending" && String(request.circuitId) === String(circuit.id));
            return <Panel key={`request-${circuit.id}`} style={styles.hackerPermissionCard} styles={styles}>
              <View style={styles.hackerPermissionTop}><View style={styles.hackerPermissionIcon}><Ionicons name={circuit.icon || "flash-outline"} size={21} color={pending ? theme.warning : theme.accentBright} /></View><View style={{ flex: 1 }}><Text style={styles.hackerPermissionName}>{circuit.name}</Text><Text style={styles.hackerPermissionMeta}>{Number(circuit.power || 0).toLocaleString("es-CL")} W · acceso no habilitado</Text></View><Text style={[styles.hackerPermissionState, { color: pending ? theme.warning : theme.muted }]}>{pending ? "PENDIENTE" : "BLOQUEADO"}</Text></View>
              {pending ? <Pressable accessibilityLabel={`Cancelar solicitud para ${circuit.name}`} onPress={() => cancelPermissionRequest(pending)} style={({ pressed }) => [styles.hackerRequestCancel, pressed && styles.pressed]}><Ionicons name="close-circle-outline" size={17} color={theme.warning} /><Text style={styles.hackerRequestCancelText}>CANCELAR SOLICITUD</Text></Pressable> : <Pressable accessibilityLabel={`Solicitar permiso para ${circuit.name}`} onPress={() => requestCircuitPermission(circuit)} style={({ pressed }) => [styles.hackerRequestButton, pressed && styles.pressed]}><Ionicons name="send-outline" size={17} color={theme.onAccent} /><Text style={styles.hackerRequestButtonText}>SOLICITAR AL ADMINISTRADOR</Text></Pressable>}
            </Panel>;
          })}</View> : <Panel style={styles.permissionEmptyPanel} styles={styles}><Ionicons name="shield-checkmark" size={36} color={theme.success} /><Text style={styles.permissionEmptyTitle}>TODOS TUS PERMISOS ESTÁN LISTOS</Text><Text style={styles.permissionEmptyText}>No quedan circuitos por solicitar para este perfil.</Text></Panel>}

          <SectionTitle title="ACADEMIA ELÉCTRICA" caption="Conceptos para aprender hoy y estudiar en el futuro" icon="school-outline" styles={styles} theme={theme} />
          <View style={styles.hackerLessonGrid}>{HACKER_LESSONS.map((lesson) => <Panel key={lesson.id} style={styles.hackerLessonCard} styles={styles}><View style={styles.hackerLessonTop}><Ionicons name={lesson.icon} size={21} color={theme.accentBright} /><Text style={styles.hackerLessonCode}>{lesson.code}</Text></View><Text style={styles.hackerLessonTitle}>{lesson.title}</Text><Text style={styles.hackerLessonText}>{lesson.text}</Text></Panel>)}</View>
          {!!profileCircuits.length && <Panel styles={styles}><SectionTitle title="DATOS DE MIS CIRCUITOS" caption="Valores nominales y corriente aproximada" icon="hardware-chip-outline" styles={styles} theme={theme} />{profileCircuits.map((circuit, index) => <View key={`learn-${circuit.id}`}><View style={styles.hackerCircuitRow}><Ionicons name={circuit.icon || "flash-outline"} size={19} color={circuit.on ? theme.success : theme.muted} /><View style={{ flex: 1 }}><Text style={styles.hackerCircuitName}>{circuit.name}</Text><Text style={styles.hackerCircuitMeta}>{circuit.on ? "ENCENDIDO" : "APAGADO"}{circuit.essential ? " · PRIORIDAD" : ""}{circuit.adminLocked ? " · CONTROL ADMIN" : ""}</Text></View><View><Text style={styles.hackerCircuitValue}>{Number(circuit.power || 0).toLocaleString("es-CL")} W</Text><Text style={styles.hackerCircuitAmps}>≈ {(Number(circuit.power || 0) / Math.max(Number(circuit.voltage || voltage || 220), 1)).toFixed(2)} A</Text></View></View>{index < profileCircuits.length - 1 && <View style={styles.separator} />}</View>)}</Panel>}
          <Panel style={styles.hackerSafetyPanel} styles={styles}><Ionicons name="warning-outline" size={24} color={theme.warning} /><Text style={styles.hackerSafetyText}>MODO APRENDIZAJE: observa y pregunta. Nunca abras un tablero, retires tapas, toques cables ni manipules enchufes dañados. Eso corresponde a un adulto capacitado.</Text></Panel>
        </>}

        {showInformationModule("kids.learning") && <><SectionTitle title={hackerMode ? "MISIONES ECO" : "MISIÓN ECO"} caption="Pequeñas acciones que ayudan a tu familia y al planeta" icon="leaf-outline" styles={styles} theme={theme} />
        <Panel style={styles.ecoProgressPanel} styles={styles}><View style={styles.ecoProgressHeader}><View><Text style={styles.ecoProgressLabel}>PROGRESO DE {activeProfile.name.toUpperCase()}</Text><Text style={styles.ecoProgressValue}>{childMissionRecords.length}/{ECO_TIPS.length} MISIONES</Text></View><Text style={styles.ecoProgressSaving}>≈ {childMissionWh} Wh educativos</Text></View><ProgressBar value={childMissionRecords.length / ECO_TIPS.length * 100} color={theme.success} styles={styles} theme={theme} /><View style={styles.ecoBadgeRow}>{ECO_BADGES.map((badge) => { const unlocked = childMissionRecords.length >= badge.min; return <View key={badge.id} style={[styles.ecoBadge, unlocked && styles.ecoBadgeUnlocked]}><Ionicons name={badge.icon} size={18} color={unlocked ? theme.success : theme.muted} /><Text style={[styles.ecoBadgeText, unlocked && { color: theme.success }]}>{badge.label}</Text></View>; })}</View></Panel>
        <View style={styles.ecoTipGrid}>{ECO_TIPS.map((tip, index) => { const completed = Boolean(kidsMissions[`${activeProfile.id}:${tip.id}`]); return <Panel key={tip.id} style={[styles.ecoTipCard, completed && styles.ecoTipCardCompleted]} styles={styles}><View style={styles.ecoTipTop}><View style={styles.ecoTipIcon}><Ionicons name={completed ? "checkmark" : tip.icon} size={22} color={theme.success} /></View>{hackerMode && <Text style={styles.ecoMissionCode}>MISIÓN {String(index + 1).padStart(2, "0")}</Text>}</View><Text style={styles.ecoTipTitle}>{tip.title}</Text><Text style={styles.ecoTipText}>{tip.text}</Text><Pressable feedback="confirm" accessibilityLabel={`${completed ? "Desmarcar" : "Completar"} misión ${tip.title}`} onPress={() => toggleEcoMission(tip)} style={({ pressed }) => [styles.ecoMissionButton, completed && styles.ecoMissionButtonCompleted, pressed && styles.pressed]}><Ionicons name={completed ? "checkmark-circle" : "ellipse-outline"} size={17} color={completed ? theme.success : theme.accentBright} /><Text style={[styles.ecoMissionButtonText, completed && { color: theme.success }]}>{completed ? "MISIÓN COMPLETADA" : "MARCAR COMO HECHA"}</Text></Pressable></Panel>; })}</View></>}
        <Panel style={styles.childSafetyPanel} styles={styles}>
          <Ionicons name={gridAvailable ? "shield-checkmark" : "battery-charging"} size={25} color={gridAvailable ? theme.success : theme.warning} />
          <View style={{ flex: 1 }}><Text style={styles.childSafetyTitle}>{gridAvailable ? "CASA CON ENERGÍA" : "USANDO RESPALDO"}</Text><Text style={styles.childSafetyText}>{cardInserted ? "El tarjetero está habilitado." : "Algunos controles pueden estar bloqueados hasta insertar la tarjeta."}</Text></View>
        </Panel>
        <Text style={styles.childPermissionNotice}>Los permisos y decisiones prioritarias pertenecen al administrador. Cambia de perfil para volver al control completo.</Text>
      </ScreenScroller>
    </>
  };

  const HomeScreen = () => (
    <>
      <AppHeader title="CENTRO DE CONTROL" subtitle="Supervisión doméstica en tiempo real" connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        {pendingPermissionRequests.length > 0 && <Pressable accessibilityLabel="Abrir solicitudes VoltKids pendientes" onPress={openPermissionCenter} style={({ pressed }) => [styles.permissionHomeAlert, pressed && styles.pressed]}><View style={styles.permissionHomeAlertIcon}><Ionicons name="notifications" size={24} color={theme.warning} /><View style={styles.permissionHomeAlertBadge}><Text style={styles.permissionHomeAlertBadgeText}>{pendingPermissionRequests.length}</Text></View></View><View style={{ flex: 1 }}><Text style={styles.permissionHomeAlertTitle}>SOLICITUDES VOLTKIDS</Text><Text style={styles.permissionHomeAlertText}>{pendingPermissionRequests.length} permiso{pendingPermissionRequests.length === 1 ? " espera" : "s esperan"} tu decisión.</Text></View><Ionicons name="chevron-forward" size={20} color={theme.warning} /></Pressable>}
        <Panel style={styles.heroPanel} styles={styles}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.overline}>POTENCIA INSTANTÁNEA</Text>
              <Text style={styles.heroValue}>{power.toLocaleString("es-CL")}<Text style={styles.heroUnit}> W</Text></Text>
            </View>
            <View style={styles.pulseWrap}><View style={styles.pulseRing} /><View style={styles.pulseDot} /></View>
          </View>
          <View style={styles.heroFooter}>
            <Text style={styles.heroFooterText}>{activeCircuits.length} circuitos activos</Text>
            <Text style={styles.heroFooterText}>FP 0,96</Text>
          </View>
        </Panel>
{showInformationModule("home.metrics") && <>
        <View style={styles.metricGrid}>
          <MetricCard icon="speedometer-outline" label="VOLTAJE" value={voltage.toFixed(1)} unit="V" styles={styles} theme={theme} onPress={() => setMetricModalId("voltage")} />
          <MetricCard icon="pulse-outline" label="CORRIENTE" value={current.toFixed(1)} unit="A" styles={styles} theme={theme} onPress={() => setMetricModalId("current")} />
          <MetricCard icon="flash-outline" label="CONSUMO" value={energy.toFixed(1)} unit="kWh" styles={styles} theme={theme} onPress={() => setMetricModalId("consumption")} />
          <MetricCard icon="cash-outline" label="COSTO EST." value={`$${cost.toLocaleString("es-CL")}`} unit="CLP" styles={styles} theme={theme} onPress={() => setMetricModalId("cost")} />
        </View>
        </>}
        {showInformationModule("home.status") && <Panel styles={styles}>
          <SectionTitle title="ESTADO DEL HOGAR" caption={eventMessage} icon="shield-checkmark-outline" styles={styles} theme={theme} />
          <View style={styles.stateGrid}>
            <View style={styles.stateItem}>
              <Ionicons name="card-outline" size={23} color={cardInserted ? theme.success : theme.warning} />
              <Text style={styles.stateLabel}>Tarjeta</Text>
              <Text style={[styles.stateValue, { color: cardInserted ? theme.success : theme.warning }]}>{cardInserted ? "INSERTADA" : "RETIRADA"}</Text>
            </View>
            <View style={styles.stateDivider} />
            <View style={styles.stateItem}>
              <Ionicons name={gridAvailable ? "flash" : "battery-charging"} size={23} color={gridAvailable ? theme.success : theme.warning} />
              <Text style={styles.stateLabel}>Alimentación</Text>
              <Text style={[styles.stateValue, { color: gridAvailable ? theme.success : theme.warning }]}>{gridAvailable ? "RED" : "BATERÍA"}</Text>
            </View>
            <View style={styles.stateDivider} />
            <View style={styles.stateItem}>
              <Ionicons name="star" size={22} color={theme.accentBright} />
              <Text style={styles.stateLabel}>Esenciales</Text><Text style={styles.stateValue}>{essentialCircuits.length}</Text>
            </View>
          </View>
        </Panel>}
        {power >= anomalyPowerThreshold && <Panel style={styles.alertPanel} styles={styles}>
          <Ionicons name="warning-outline" size={24} color={theme.warning} />
          <View style={{ flex: 1 }}><Text style={styles.alertTitle}>LÍMITE DE POTENCIA SUPERADO</Text><Text style={styles.alertText}>La lectura superó el límite configurado de {anomalyPowerThreshold.toLocaleString("es-CL")} W.</Text></View>
        </Panel>}
      </ScreenScroller>
    </>
  );

  const HardwarePrototypePanel = () => <Panel styles={styles}>
    <SectionTitle title="PROTOTIPO ARDUINO · 3 CIRCUITOS" caption="Cada circuito controla su relé y el LED correspondiente del shield; General alimenta ambos pisos" icon="hardware-chip-outline" styles={styles} theme={theme} />
    {["GENERAL", "1ER PISO", "2DO PISO"].map((label, index) => {
      const slot = index + 1;
      const circuit = circuits.find((item) => String(item.id) === String(slot));
      const physicalValue = hardwareBridge.relayIndicatorStates?.[String(slot)] ?? hardwareBridge.circuitStates?.[String(slot)];
      const physicalKnown = typeof physicalValue === "boolean";
      const mismatch = physicalKnown && Boolean(circuit?.on) !== physicalValue;
      const activeLow = Boolean((Number(hardwarePrototype.activeLowMask || 0) >> index) & 1);
      return <View key={`arduino-test-slot-${slot}`}>
        {index > 0 && <View style={styles.separator} />}
        <View style={styles.technicalCircuitRow}>
          <View style={[styles.circuitIcon, circuit?.on && styles.circuitIconActive]}><Ionicons name={circuit?.icon || "flash-outline"} size={21} color={circuit?.on ? theme.accentBright : theme.muted} /></View>
          <View style={{ flex: 1 }}><Text style={styles.circuitName}>{slot}. {label}</Text><Text style={styles.circuitMeta}>D{(hardwarePrototype.relayPins || [12, 11, 10])[index]} · {activeLow ? "activo LOW" : "activo HIGH"} · APP {circuit?.on ? "ON" : "OFF"} · RELÉ/LED {physicalKnown ? physicalValue ? "ENCENDIDO" : "APAGADO" : "SIN DATO"}</Text>{mismatch && <Text style={[styles.circuitMeta, { color: theme.warning }]}>Esperando confirmación física del Arduino</Text>}</View>
          <Switch value={Boolean(circuit?.on)} disabled={!hardwareFirmwareReady || !circuit} onValueChange={(value) => toggleCircuit(circuit.id, value)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={circuit?.on ? theme.accentBright : theme.muted} />
        </View>
        <View style={styles.technicalActionGrid}>
          <Pressable accessibilityLabel={`Cambiar pin de ${label}`} disabled={!hardwareFirmwareReady} onPress={() => changeRelayPin(slot, -1)} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="hardware-chip-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>PIN D{(hardwarePrototype.relayPins || [12, 11, 10])[index]} · CAMBIAR</Text></Pressable>
          <Pressable accessibilityLabel={`Cambiar polaridad de ${label}`} disabled={!hardwareFirmwareReady} onPress={() => toggleRelayPolarity(slot)} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="git-compare-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>{activeLow ? "USAR HIGH" : "USAR LOW"}</Text></Pressable>
          <Pressable accessibilityLabel={`Probar relé de ${label}`} disabled={!hardwareFirmwareReady} onPress={() => sendCommand({ type: "test_relay", slot, commandId: `ui-test-${Date.now()}` })} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="pulse-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>PULSO FÍSICO</Text></Pressable>
        </View>
      </View>;
    })}
    <View style={styles.prototypeDivider} />
    <SectionTitle title="INDICADOR DE TARJETA" caption="Salida configurable e independiente de los tres circuitos" icon="card-outline" styles={styles} theme={theme} />
    <View style={styles.technicalCircuitRow}>
      <View style={[styles.circuitIcon, cardLedMode !== "off" && styles.circuitIconActive]}><Ionicons name={cardInserted ? "card" : "card-outline"} size={21} color={cardInserted ? theme.success : theme.warning} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.circuitName}>TARJETA · {cardInserted ? "CONECTADA" : "RETIRADA"}</Text>
        <Text style={styles.circuitMeta}>D{cardLedConfig.pin} · {cardLedConfig.activeLow ? "activo LOW" : "activo HIGH"} · {cardLedStatusText}</Text>
        <Text style={[styles.circuitMeta, { color: hardwareFirmwareReady ? theme.success : theme.warning }]}>{hardwareFirmwareReady ? `Estado físico confirmado · salida instantánea ${hardwareBridge.cardLedOutput ? "ON" : "OFF"}` : hardwareBridge.connected ? "Actualiza el firmware del UNO a ARDUINO TEST 1.2" : "Conecta el Arduino para guardar o probar cambios"}</Text>
      </View>
      <StatusPill icon={cardInserted ? "checkmark-circle-outline" : "remove-circle-outline"} label={cardInserted ? "PRESENTE" : "AUSENTE"} color={cardInserted ? theme.success : theme.warning} styles={styles} />
    </View>
    <View style={styles.technicalActionGrid}>
      <Pressable accessibilityLabel="Cambiar pin del indicador de tarjeta" disabled={!hardwareFirmwareReady} onPress={() => changeCardLedPin(-1)} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="hardware-chip-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>PIN D{cardLedConfig.pin}</Text></Pressable>
      <Pressable accessibilityLabel="Cambiar polaridad del indicador de tarjeta" disabled={!hardwareFirmwareReady} onPress={() => sendCardLedConfig({ activeLow: !cardLedConfig.activeLow })} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="git-compare-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>{cardLedConfig.activeLow ? "USAR HIGH" : "USAR LOW"}</Text></Pressable>
      <Pressable accessibilityLabel="Cambiar velocidad de parpadeo durante un corte" disabled={!hardwareFirmwareReady} onPress={cycleCardLedBlink} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="timer-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>CORTE: {Number(cardLedConfig.outageBlinkMs) / 1000} s</Text></Pressable>
      <Pressable accessibilityLabel="Probar indicador de tarjeta" disabled={!hardwareFirmwareReady} onPress={() => sendCommand({ type: "test_card_led", commandId: `card-led-test-${Date.now()}` })} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="flash-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>PULSO DE PRUEBA</Text></Pressable>
    </View>
    <View style={styles.anomalySafetyPanel}><Ionicons name="information-circle-outline" size={22} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>La tarjeta comienza habilitada. El indicador queda fijo con tarjeta y red, parpadea al ritmo configurado durante un corte, parpadea cada 1 s durante la cuenta regresiva y se apaga al terminar. Puede usar D13 o un pin libre; nunca repitas el pin de un circuito.</Text></View>
  </Panel>;

  const CircuitsScreen = () => (
    <>
      <AppHeader title={isChildProfile ? "MIS HABITACIONES" : "CIRCUITOS"} subtitle={isChildProfile ? "Controles VoltKids aprobados por tu familia" : "Control y prioridad de las cargas"} connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <SectionTitle title={isChildProfile ? "MIS CONTROLES" : "DISTRIBUCIÓN"} caption={isChildProfile ? `${visibleProfileCircuits.length} circuitos encontrados` : `${visibleProfileCircuits.length} de ${circuits.length} circuitos · Pulsa la estrella para definir prioridad`} icon={isChildProfile ? "shield-checkmark-outline" : "git-network-outline"} styles={styles} theme={theme} />
        {!isChildProfile && circuitViewMode === "detail" ? <Panel style={styles.circuitList} styles={styles}>
          {visibleProfileCircuits.map((circuit, index) => {
            const locked = (!cardInserted || !gridAvailable) && !circuit.essential;
            const diagnostic = circuitDiagnostics[String(circuit.id)];
            return <View key={circuit.id}>
              <View style={[styles.circuitRow, locked && styles.circuitLocked]}>
                <View style={[styles.circuitIcon, circuit.on && styles.circuitIconActive]}>
                  {circuit.photoUri ? <Image source={{ uri: circuit.photoUri }} style={styles.circuitPhoto} /> : <Ionicons name={circuit.icon || "flash-outline"} size={21} color={circuit.on ? theme.accentBright : theme.muted} />}
                </View>
                <View style={styles.circuitInfo}>
                  <Text style={styles.circuitName} numberOfLines={1}>{circuit.name}</Text>
                  <Text style={styles.circuitMeta} numberOfLines={1}>{circuit.room || "Sin habitación"} · {circuit.power.toLocaleString("es-CL")} W · {circuit.on ? "Activo" : "Apagado"}{circuit.brand ? ` · ${circuit.brand}` : ""}</Text>
                  <View style={styles.circuitControlTags}><View style={styles.sourceTag}><Ionicons name={circuit.sourceType === "photo" ? "camera-outline" : circuit.sourceType === "link" ? "link-outline" : circuit.sourceType === "text" ? "document-text-outline" : "hardware-chip-outline"} size={10} color={theme.muted} /><Text style={styles.sourceTagText}>{sourceLabel(circuit.sourceType)}</Text></View><Pressable accessibilityLabel={`${circuit.adminLocked ? "Liberar" : "Bloquear"} ${circuit.name} para VoltKids`} onPress={() => toggleCircuitLock(circuit.id)} style={({ pressed }) => [styles.adminControlTag, !circuit.adminLocked && styles.adminControlTagUnlocked, pressed && styles.pressed]}><Ionicons name={circuit.adminLocked ? "lock-closed" : "lock-open-outline"} size={10} color={circuit.adminLocked ? theme.warning : theme.muted} /><Text style={[styles.adminControlTagText, !circuit.adminLocked && { color: theme.muted }]}>{circuit.adminLocked ? "BLOQUEADO · LIBERAR" : "BLOQUEAR VOLTKIDS"}</Text></Pressable></View>
                  {diagnostic && <Pressable accessibilityLabel={`Ver diagnóstico de ${circuit.name}`} onPress={() => notifyUser(`Diagnóstico · ${circuit.name}`, `${diagnostic.reason}\n\nSolicitado: ${diagnostic.expected ? "encendido" : "apagado"}. Confirmado: ${diagnostic.actual ? "encendido" : "apagado"}.\n${dateTimeLabel(diagnostic.timestamp)}`)} style={({ pressed }) => [styles.circuitDiagnosticTag, pressed && styles.pressed]}><Ionicons name="search-outline" size={11} color={theme.warning} /><Text style={styles.circuitDiagnosticTagText}>VER POR QUÉ CAMBIÓ</Text></Pressable>}
                </View>
                <Pressable accessibilityLabel={`${circuit.name}: ${circuit.essential ? "esencial" : "no esencial"}`} onPress={() => toggleEssential(circuit.id)} style={({ pressed }) => [styles.essentialButton, circuit.essential && styles.essentialButtonActive, pressed && styles.pressed]}>
                  <Ionicons name={circuit.essential ? "star" : "star-outline"} size={17} color={circuit.essential ? theme.accentBright : theme.muted} />
                </Pressable>
                <Pressable accessibilityLabel={`Editar ${circuit.name}`} onPress={() => openEditCircuit(circuit)} style={({ pressed }) => [styles.editCircuitButton, pressed && styles.pressed]}><Ionicons name="create-outline" size={17} color={theme.muted} /></Pressable>
                <Switch value={circuit.on} disabled={locked} onValueChange={(value) => toggleCircuit(circuit.id, value)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={circuit.on ? theme.accentBright : theme.muted} ios_backgroundColor={theme.border} />
              </View>
              {index < visibleProfileCircuits.length - 1 && <View style={styles.separator} />}
            </View>;
          })}
        </Panel> : visibleProfileCircuits.length ? <LargeCircuitGrid circuits={visibleProfileCircuits} cardInserted={cardInserted} gridAvailable={gridAvailable} onToggle={toggleCircuit} onPriority={toggleEssential} onEdit={openEditCircuit} onToggleLock={toggleCircuitLock} styles={styles} theme={theme} desktop={isDesktopLayout} restricted={isChildProfile} /> : <Panel style={styles.childEmptyPanel} styles={styles}><Ionicons name="search-outline" size={33} color={theme.muted} /><Text style={styles.childEmptyTitle}>SIN COINCIDENCIAS</Text><Text style={styles.childEmptyText}>{isChildProfile && !profileCircuits.length ? "Un administrador debe seleccionar al menos un circuito para VoltKids." : "Cambia la búsqueda o selecciona otra habitación."}</Text></Panel>}

        {!isChildProfile && <>
          <Panel styles={styles}>
            <View style={styles.circuitViewHeader}>
              <View style={{ flex: 1 }}><SectionTitle title="CONTROL RÁPIDO" caption="El modo Botones / Lista se cambia desde Ajustes" icon="options-outline" styles={styles} theme={theme} /></View>
              <Pressable accessibilityLabel={cardInserted ? "Retirar tarjeta inteligente" : "Insertar tarjeta inteligente"} onPress={toggleCard} style={({ pressed }) => [styles.compactCardButton, !cardInserted && styles.compactCardButtonWarning, pressed && styles.pressed]}>
                <Ionicons name={cardInserted ? "card" : "card-outline"} size={18} color={cardInserted ? theme.success : theme.warning} />
                <View><Text style={styles.compactCardLabel}>TARJETERO</Text><Text style={[styles.compactCardState, { color: cardInserted ? theme.success : theme.warning }]}>{cardInserted ? "VIVIENDA HABILITADA" : "SOLO ESENCIALES"}</Text></View>
              </Pressable>
            </View>
          </Panel>
          {shutdownSeconds !== null && <Panel style={styles.countdownPanel} styles={styles}>
            <View style={styles.countdownCircle}><Text style={styles.countdownValue}>{shutdownSeconds}</Text></View>
            <View style={{ flex: 1 }}><Text style={styles.countdownTitle}>APAGADO PROGRAMADO</Text><Text style={styles.countdownText}>Se desconectarán únicamente los circuitos no esenciales.</Text></View>
            <Pressable accessibilityLabel="Cancelar apagado" onPress={toggleCard} style={styles.cancelButton}><Text style={styles.cancelButtonText}>CANCELAR</Text></Pressable>
          </Panel>}
        </>}

        {showInformationModule("circuits.search") && <Panel styles={styles}><SectionTitle title="BUSCAR Y ORDENAR" caption="Encuentra circuitos por nombre, equipo o habitación" icon="search-outline" styles={styles} theme={theme} /><View style={styles.circuitSearchBox}><Ionicons name="search-outline" size={19} color={theme.muted} /><TextInput value={circuitSearch} onChangeText={setCircuitSearch} placeholder="Buscar circuito…" placeholderTextColor={theme.muted} style={styles.circuitSearchInput} />{!!circuitSearch && <Pressable accessibilityLabel="Limpiar búsqueda" onPress={() => setCircuitSearch("")} style={({ pressed }) => [styles.circuitSearchClear, pressed && styles.pressed]}><Ionicons name="close-circle" size={19} color={theme.muted} /></Pressable>}</View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomFilterRow}><Pressable accessibilityLabel="Mostrar todas las habitaciones" onPress={() => setRoomFilter("all")} style={({ pressed }) => [styles.filterChip, roomFilter === "all" && styles.filterChipActive, pressed && styles.pressed]}><Text style={[styles.filterChipText, roomFilter === "all" && styles.filterChipTextActive]}>TODAS</Text></Pressable>{roomOptions.map((room) => <Pressable key={`room-${room}`} accessibilityLabel={`Filtrar habitación ${room}`} onPress={() => setRoomFilter(room)} style={({ pressed }) => [styles.filterChip, roomFilter === room && styles.filterChipActive, pressed && styles.pressed]}><Text style={[styles.filterChipText, roomFilter === room && styles.filterChipTextActive]}>{room.toUpperCase()}</Text></Pressable>)}</ScrollView></Panel>}

        {!isChildProfile && <Pressable accessibilityLabel="Abrir notificaciones de anomalías" onPress={() => setAnomalyCenterVisible(true)} style={({ pressed }) => [styles.anomalyLauncher, anomalySummary.active > 0 && styles.anomalyLauncherPending, pressed && styles.pressed]}>
          <View style={[styles.anomalyLauncherIcon, { backgroundColor: anomalySummary.active ? `${theme.warning}18` : `${theme.success}14` }]}><Ionicons name={anomalySummary.active ? "notifications" : "notifications-outline"} size={24} color={anomalySummary.active ? theme.warning : theme.success} /></View>
          <View style={{ flex: 1 }}><Text style={styles.anomalyLauncherTitle}>NOTIFICACIONES DE ANOMALÍAS</Text><Text style={styles.anomalyLauncherText}>{anomalySummary.active ? `${anomalySummary.active} en revisión · ${anomalySummary.critical} crítica${anomalySummary.critical === 1 ? "" : "s"}` : `Sin eventos pendientes · ${anomalySummary.resolved} archivada${anomalySummary.resolved === 1 ? "" : "s"}`}</Text></View>
          <View style={[styles.anomalyLauncherBadge, { backgroundColor: anomalySummary.active ? theme.warning : theme.success }]}><Text style={styles.anomalyLauncherBadgeText}>{anomalySummary.active}</Text></View><Ionicons name="chevron-forward" size={20} color={theme.muted} />
        </Pressable>}

        {!isChildProfile && <>
          <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="hardware-chip-outline" size={22} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>Arduino Test utiliza exactamente tres circuitos físicos. Puedes editar su nombre, sector, potencia, datos nominales, fuente y observaciones desde el lápiz de cada tarjeta. La configuración física del Arduino queda al final para que el control de circuitos sea lo primero visible.</Text></Panel>
          {showInformationModule("circuits.hardware") && <HardwarePrototypePanel />}
        </>}
      </ScreenScroller>
    </>
  );

  const EnergyScreen = () => {
    const ranked = [...circuits].sort((a, b) => b.power - a.power).slice(0, 5);
    const maxRank = Math.max(...ranked.map((circuit) => Number(circuit.power || 0)), 1);
    const chartGroups = [];
    const groupCount = Math.min(6, Math.max(1, visibleHistory.length));
    const chunkSize = Math.max(1, Math.ceil(visibleHistory.length / groupCount));
    for (let index = 0; index < visibleHistory.length; index += chunkSize) {
      const chunk = visibleHistory.slice(index, index + chunkSize);
      if (!chunk.length) continue;
      chartGroups.push({
        label: new Date(chunk[chunk.length - 1].timestamp).toLocaleDateString("es-CL", { day: selectedPeriod === "1m" ? "2-digit" : undefined, month: "short" }).replace(".", ""),
        value: chunk.reduce((sum, record) => sum + Number(record.consumption || 0), 0),
      });
    }
    const chartMax = Math.max(...chartGroups.map((item) => item.value), 1);
    const detectedKeys = new Set([...detectAnomalies(visibleHistory, anomalyPowerThreshold), ...serverAnomalies].map((item) => `${item.timestamp}|${item.metric}|${item.type}`));
    const detectedCount = detectedKeys.size;
    return <>
      <AppHeader title="ENERGÍA" subtitle="Historial, diagnóstico y automatización" connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        {showInformationModule("energy.summary") && profiles.some((profile) => profile.role === "child") && <Panel styles={styles}><SectionTitle title="APORTE VOLTKIDS" caption="Misiones ecológicas registradas por los perfiles infantiles" icon="earth-outline" styles={styles} theme={theme} />{profiles.filter((profile) => profile.role === "child").map((profile, index, children) => { const missions = Object.values(kidsMissions).filter((mission) => mission.profileId === profile.id); const savedWh = missions.reduce((sum, mission) => sum + Number(mission.estimatedWh || 0), 0); return <View key={`parent-eco-${profile.id}`}><View style={styles.parentEcoRow}><View style={styles.parentEcoIcon}><Ionicons name={profile.icon || "happy-outline"} size={21} color={theme.success} /></View><View style={{ flex: 1 }}><Text style={styles.parentEcoName}>{profile.name}</Text><Text style={styles.parentEcoMeta}>{missions.length} misiones · ahorro educativo aproximado {savedWh} Wh</Text></View><Text style={styles.parentEcoValue}>{Math.round(missions.length / ECO_TIPS.length * 100)}%</Text></View>{index < children.length - 1 && <View style={styles.separator} />}</View>; })}</Panel>}
        {showInformationModule("energy.summary") && <Panel styles={styles}>
          <SectionTitle title="PERIODO DE ANÁLISIS" caption="El mismo periodo se usa en las pestañas y el archivo Excel" icon="calendar-outline" styles={styles} theme={theme} />
          <View style={styles.periodGrid}>{PERIOD_OPTIONS.map((period) => <Pressable key={period.id} accessibilityLabel={`Seleccionar ${period.label}`} onPress={() => setSelectedPeriod(period.id)} style={({ pressed }) => [styles.periodButton, selectedPeriod === period.id && styles.periodButtonActive, pressed && styles.pressed]}><Text style={[styles.periodButtonText, selectedPeriod === period.id && styles.periodButtonTextActive]}>{period.label.toUpperCase()}</Text></Pressable>)}</View>
          <View style={styles.historyMeta}><Text style={styles.historyMetaText}>{historyLoading ? "Actualizando historial…" : `${visibleHistory.length} registros · ${detectedCount} anomalías`}</Text><Text style={styles.historyMetaText}>{historySource === "simulation" ? "SIMULACIÓN" : historySource === "mixed" ? "MIXTO" : "MEDICIÓN REAL"}</Text></View>
        </Panel>}

{showInformationModule("energy.summary") && <>
        <View style={styles.metricGrid}>
          <MetricCard icon="speedometer-outline" label="VOLTAJE" value={analyses.voltage.average.toFixed(1)} unit="V prom." styles={styles} theme={theme} onPress={() => setMetricModalId("voltage")} />
          <MetricCard icon="pulse-outline" label="CORRIENTE" value={analyses.current.average.toFixed(1)} unit="A prom." styles={styles} theme={theme} onPress={() => setMetricModalId("current")} />
          <MetricCard icon="flash-outline" label="CONSUMO" value={periodConsumption.toFixed(1)} unit="kWh" styles={styles} theme={theme} onPress={() => setMetricModalId("consumption")} />
          <MetricCard icon="cash-outline" label="COSTO" value={`$${Math.round(periodCost).toLocaleString("es-CL")}`} unit="CLP" styles={styles} theme={theme} onPress={() => setMetricModalId("cost")} />
        </View>
        </>}

        {showInformationModule("energy.analysis") && <><Panel styles={styles}>
          <SectionTitle title="EVOLUCIÓN DEL CONSUMO" caption={`kWh agrupados durante ${periodLabel}`} icon="bar-chart-outline" styles={styles} theme={theme} />
          <View style={styles.chart}>{chartGroups.map((item, index) => <View key={`${item.label}-${index}`} style={styles.barGroup}>
            <Text style={styles.barValue}>{item.value.toFixed(1)}</Text><View style={styles.barTrack}><View style={[styles.barFill, { height: `${Math.max(8, item.value / chartMax * 100)}%` }]} /></View><Text style={styles.barLabel}>{item.label}</Text>
          </View>)}</View>
        </Panel>

        <Pressable accessibilityLabel={`Descargar historial de ${periodLabel} en Excel`} disabled={exporting || historyLoading} onPress={downloadHistory} style={({ pressed }) => [styles.exportButton, (exporting || historyLoading) && styles.disabledButton, pressed && styles.pressed]}>
          {exporting ? <ActivityIndicator size="small" color={theme.onAccent} /> : <Ionicons name="download-outline" size={22} color={theme.onAccent} />}
          <View style={{ flex: 1 }}><Text style={styles.exportTitle}>{exporting ? "GENERANDO EXCEL…" : "DESCARGAR TABLA EXCEL"}</Text><Text style={styles.exportText}>{periodLabel} · historial, resumen, anomalías, circuitos y horarios</Text></View>
          <Ionicons name="document-attach-outline" size={22} color={theme.onAccent} />
        </Pressable>

        <Panel styles={styles}>
          <SectionTitle title="CARGAS PRINCIPALES" caption="Potencia nominal instalada" icon="speedometer-outline" styles={styles} theme={theme} />
          {ranked.map((circuit) => <View key={circuit.id} style={styles.rankingRow}>
            <View style={styles.rankingTitleRow}><Text style={styles.rankingName}>{circuit.name}{circuit.on ? " · ACTIVA" : ""}</Text><Text style={styles.rankingValue}>{Number(circuit.power || 0).toLocaleString("es-CL")} W</Text></View>
            <ProgressBar value={Number(circuit.power || 0) / maxRank * 100} color={circuit.on ? theme.accent : theme.muted} styles={styles} theme={theme} />
          </View>)}
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="RECOMENDACIONES VOLTKEY" caption="Consejos calculados según cargas, horarios y consumo" icon="sparkles-outline" styles={styles} theme={theme} />
          {recommendations.map((recommendation, index) => <View key={`${recommendation.title}-${index}`}>
            <View style={styles.recommendationRow}><View style={styles.recommendationIcon}><Ionicons name={recommendation.icon} size={20} color={theme.accentBright} /></View><View style={{ flex: 1 }}><Text style={styles.insightTitle}>{recommendation.title.toUpperCase()}</Text><Text style={styles.insightText}>{recommendation.text}</Text></View></View>
            {index < recommendations.length - 1 && <View style={styles.separator} />}
          </View>)}
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="TEMPORIZADORES DIGITALES" caption="Enciende y apaga circuitos automáticamente" icon="timer-outline" styles={styles} theme={theme} />
          {schedules.map((schedule, index) => {
            const circuit = circuits.find((item) => String(item.id) === String(schedule.circuitId));
            const active = isScheduleActive(schedule, new Date());
            return <View key={schedule.id}>
              <Pressable accessibilityLabel={`Editar temporizador de ${circuit?.name || "circuito"}`} onPress={() => openEditSchedule(schedule)} style={({ pressed }) => [styles.scheduleRow, pressed && styles.pressed]}>
                <View style={[styles.scheduleIcon, active && styles.scheduleIconActive]}><Ionicons name="time-outline" size={21} color={active ? theme.success : theme.accentBright} /></View>
                <View style={{ flex: 1 }}><Text style={styles.scheduleName}>{circuit?.name || "Circuito eliminado"}</Text><Text style={styles.scheduleTime}>{schedule.start} → {schedule.end}</Text><Text style={styles.scheduleDays}>{scheduleDaysLabel(schedule.days)} · {active ? "EN HORARIO" : "FUERA DE HORARIO"}</Text></View>
                <Switch value={schedule.enabled} onValueChange={() => toggleScheduleEnabled(schedule)} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={schedule.enabled ? theme.accentBright : theme.muted} />
              </Pressable>
              {index < schedules.length - 1 && <View style={styles.separator} />}
            </View>;
          })}
          {!schedules.length && <View style={styles.emptyTimer}><Ionicons name="alarm-outline" size={31} color={theme.muted} /><Text style={styles.emptyText}>Aún no hay horarios configurados.</Text></View>}
          <Pressable accessibilityLabel="Crear temporizador digital" onPress={() => openNewSchedule()} style={({ pressed }) => [styles.secondaryButton, styles.timerAddButton, pressed && styles.pressed]}><Ionicons name="add-circle-outline" size={19} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>NUEVO TEMPORIZADOR</Text></Pressable>
        </Panel></>}
      </ScreenScroller>
    </>;
  };

  const AnomalyCenterScreen = () => {
    const statusLabel = (status) => status === "resolved" ? "RESUELTA" : status === "reviewed" ? "REVISADA" : "PENDIENTE";
    const statusColor = (status) => status === "resolved" ? theme.success : status === "reviewed" ? theme.accentBright : theme.warning;
    const overallStatus = anomalySummary.critical ? "ATENCIÓN PRIORITARIA" : anomalySummary.active ? "REVISIÓN PENDIENTE" : anomalySummary.total ? "TODO ARCHIVADO" : "SIN EVENTOS";
    const overallColor = anomalySummary.critical ? theme.danger : anomalySummary.active ? theme.warning : theme.success;
    return <SafeAreaView style={styles.modalSafe}>
      <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
      <View style={styles.modalHeader}>
        <Pressable accessibilityLabel="Cerrar notificaciones de anomalías" onPress={() => setAnomalyCenterVisible(false)} style={({ pressed }) => [styles.modalIconButton, pressed && styles.pressed]}><Ionicons name="close" size={23} color={theme.text} /></Pressable>
        <View style={{ flex: 1 }}><Text style={styles.modalEyebrow}>CENTRO DE NOTIFICACIONES</Text><Text style={styles.modalTitle}>ANOMALÍAS</Text></View>
        <StatusPill icon={anomalySummary.active ? "notifications" : "checkmark-circle-outline"} label={`${anomalySummary.active} ACTIVAS`} color={anomalySummary.active ? theme.warning : theme.success} styles={styles} />
      </View>
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme} positionRef={anomalyScrollPositionRef}>
        <Panel style={[styles.anomalyOverview, { borderColor: `${overallColor}88` }]} styles={styles}>
          <View style={styles.anomalyOverviewHeader}><View><Text style={styles.overline}>ESTADO GENERAL DEL PERIODO</Text><Text style={[styles.anomalyOverviewStatus, { color: overallColor }]}>{overallStatus}</Text><Text style={styles.anomalyOverviewPeriod}>{periodLabel} · {visibleHistory.length} registros analizados</Text></View><View style={[styles.anomalyOverviewIcon, { borderColor: overallColor, backgroundColor: `${overallColor}14` }]}><Ionicons name={anomalySummary.active ? "warning" : "checkmark-circle"} size={31} color={overallColor} /></View></View>
          <View style={styles.anomalySummaryGrid}>
            {[{ label: "TOTAL", value: anomalySummary.total, color: theme.text }, { label: "CRÍTICAS", value: anomalySummary.critical, color: theme.danger }, { label: "EN REVISIÓN", value: anomalySummary.active, color: theme.warning }, { label: "ARCHIVADAS", value: anomalySummary.resolved, color: theme.success }].map((item) => <View key={item.label} style={styles.anomalySummaryCard}><Text style={[styles.anomalySummaryValue, { color: item.color }]}>{item.value}</Text><Text style={styles.anomalySummaryLabel}>{item.label}</Text></View>)}
          </View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="CARPETAS" caption="Las anomalías resueltas se conservan en un archivo separado" icon="folder-open-outline" styles={styles} theme={theme} />
          <View style={styles.anomalyFolderGrid}>{[
            { id: "active", title: "EN REVISIÓN", text: `${anomalySummary.active} eventos`, icon: "alert-circle-outline", color: theme.warning },
            { id: "resolved", title: "RESUELTAS", text: `${anomalySummary.resolved} archivadas`, icon: "archive-outline", color: theme.success },
          ].map((folder) => {
            const selected = anomalyFolder === folder.id;
            return <Pressable key={folder.id} accessibilityLabel={`Abrir carpeta ${folder.title}`} onPress={() => { setAnomalyFolder(folder.id); setAnomalyStatusFilter("all"); }} style={({ pressed }) => [styles.anomalyFolderButton, selected && styles.anomalyFolderButtonActive, pressed && styles.pressed]}><View style={[styles.anomalyFolderIcon, { backgroundColor: `${folder.color}16` }]}><Ionicons name={folder.icon} size={22} color={folder.color} /></View><View style={{ flex: 1 }}><Text style={styles.anomalyFolderTitle}>{folder.title}</Text><Text style={styles.anomalyFolderText}>{folder.text}</Text></View><Ionicons name={selected ? "folder-open" : "folder-outline"} size={20} color={selected ? folder.color : theme.muted} /></Pressable>;
          })}</View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="LÍMITE DE ALERTA" caption="Define desde cuántos watts VoltKey registra demanda elevada" icon="speedometer-outline" styles={styles} theme={theme} />
          <View style={styles.anomalyThresholdRow}>
            <View style={{ flex: 1 }}><FormField label="POTENCIA (W)" value={anomalyThresholdInput} onChangeText={(value) => setAnomalyThresholdInput(value.replace(/\D/g, "").slice(0, 5))} placeholder="3500" styles={styles} keyboardType="number-pad" maxLength={5} /><Text style={styles.anomalyThresholdHelp}>Actual: {anomalyPowerThreshold.toLocaleString("es-CL")} W · rango permitido {MIN_ANOMALY_POWER_THRESHOLD.toLocaleString("es-CL")}–{MAX_ANOMALY_POWER_THRESHOLD.toLocaleString("es-CL")} W</Text></View>
            <Pressable accessibilityLabel="Guardar límite de alerta" onPress={saveAnomalyThreshold} style={({ pressed }) => [styles.anomalyThresholdSave, pressed && styles.pressed]}><Ionicons name="save-outline" size={19} color={theme.onAccent} /><Text style={styles.anomalyThresholdSaveText}>GUARDAR</Text></Pressable>
          </View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="PERIODO Y FILTROS" caption={`Busca fallas dentro de ${anomalyFolder === "resolved" ? "Resueltas" : "En revisión"}`} icon="options-outline" styles={styles} theme={theme} />
          <View style={styles.periodGrid}>{PERIOD_OPTIONS.map((period) => <Pressable key={period.id} accessibilityLabel={`Seleccionar ${period.label}`} onPress={() => setSelectedPeriod(period.id)} style={({ pressed }) => [styles.periodButton, selectedPeriod === period.id && styles.periodButtonActive, pressed && styles.pressed]}><Text style={[styles.periodButtonText, selectedPeriod === period.id && styles.periodButtonTextActive]}>{period.label.toUpperCase()}</Text></Pressable>)}</View>
          <Text style={styles.filterLabel}>TIPO DE MEDICIÓN</Text>
          <View style={styles.anomalyFilterGrid}>{ANOMALY_METRIC_OPTIONS.map((option) => {
            const selected = anomalyMetricFilter === option.id;
            return <Pressable key={option.id} accessibilityLabel={`Filtrar por ${option.label}`} onPress={() => setAnomalyMetricFilter(option.id)} style={({ pressed }) => [styles.anomalyFilterButton, selected && styles.anomalyFilterButtonActive, pressed && styles.pressed]}><Ionicons name={option.icon} size={16} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.anomalyFilterText, selected && styles.anomalyFilterTextActive]}>{option.label.toUpperCase()}</Text></Pressable>;
          })}</View>
          {anomalyFolder === "active" && <><Text style={styles.filterLabel}>SEGUIMIENTO</Text>
          <View style={styles.anomalyFilterGrid}>{ANOMALY_STATUS_OPTIONS.filter((option) => option.id !== "resolved").map((option) => {
            const selected = anomalyStatusFilter === option.id;
            return <Pressable key={option.id} accessibilityLabel={`Filtrar ${option.label}`} onPress={() => setAnomalyStatusFilter(option.id)} style={({ pressed }) => [styles.anomalyFilterButton, selected && styles.anomalyFilterButtonActive, pressed && styles.pressed]}><Text style={[styles.anomalyFilterText, selected && styles.anomalyFilterTextActive]}>{option.label.toUpperCase()}</Text></Pressable>;
          })}</View></>}
        </Panel>

        <SectionTitle title={anomalyFolder === "resolved" ? "ARCHIVO / RESUELTAS" : "EVENTOS EN REVISIÓN"} caption={`${filteredAnomalies.length} coincidencias · pulsa una anomalía para ver causas y solución`} icon={anomalyFolder === "resolved" ? "archive-outline" : "list-outline"} styles={styles} theme={theme} />
        {filteredAnomalies.length ? <View style={styles.anomalyList}>{filteredAnomalies.map((anomaly) => {
          const severityColor = anomaly.severity === "critical" ? theme.danger : theme.warning;
          const metric = ANOMALY_METRIC_OPTIONS.find((option) => option.id === anomaly.metric);
          const value = Number(anomaly.value);
          return <Pressable key={anomaly.key} accessibilityLabel={`Abrir anomalía ${anomaly.type}`} onPress={() => setSelectedAnomaly(anomaly)} style={({ pressed }) => [styles.panel, styles.anomalyRecord, anomaly.status === "resolved" && styles.anomalyRecordResolved, pressed && styles.pressed]}>
            <View style={[styles.anomalyRecordIcon, { borderColor: severityColor, backgroundColor: `${severityColor}12` }]}><Ionicons name={metric?.icon || "warning-outline"} size={23} color={severityColor} /></View>
            <View style={styles.anomalyRecordBody}><View style={styles.anomalyRecordTitleRow}><Text style={styles.anomalyRecordTitle} numberOfLines={2}>{anomaly.type}</Text><Text style={[styles.anomalyRecordStatus, { color: statusColor(anomaly.status), borderColor: `${statusColor(anomaly.status)}66` }]}>{statusLabel(anomaly.status)}</Text></View><Text style={styles.anomalyRecordMeta}>{dateTimeLabel(anomaly.timestamp)} · {metric?.label || "Sistema"}</Text><Text style={styles.anomalyRecordDetails} numberOfLines={2}>{anomaly.details || anomaly.guidance?.title || "Evento fuera del comportamiento habitual."}</Text>{!!anomaly.note && <View style={styles.anomalyRecordNote}><Ionicons name="document-text-outline" size={13} color={theme.accentBright} /><Text style={styles.anomalyRecordNoteText} numberOfLines={1}>{anomaly.note}</Text></View>}</View>
            <View style={styles.anomalyRecordValueBox}><Text style={styles.anomalyRecordValue}>{Number.isFinite(value) ? value.toFixed(1) : "—"}</Text><Text style={styles.anomalyRecordUnit}>{anomaly.unit || ""}</Text><Ionicons name="chevron-forward" size={18} color={theme.muted} /></View>
          </Pressable>;
        })}</View> : <Panel style={styles.anomalyEmptyPanel} styles={styles}><Ionicons name={anomalyFolder === "resolved" ? "archive-outline" : "checkmark-circle-outline"} size={38} color={theme.success} /><Text style={styles.anomalyEmptyTitle}>{anomalyFolder === "resolved" ? "ARCHIVO VACÍO" : "SIN COINCIDENCIAS"}</Text><Text style={styles.anomalyEmptyText}>{anomalyFolder === "resolved" ? "Cuando marques una anomalía como resuelta, quedará guardada en esta carpeta." : anomalyCatalog.length ? "Cambia los filtros para ver otros eventos del periodo." : "No se detectaron anomalías en el periodo seleccionado."}</Text></Panel>}

        <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="shield-checkmark-outline" size={22} color={theme.accentBright} /><Text style={styles.anomalySafetyText}>Los estados ayudan a organizar el seguimiento: “Resuelta” no sustituye una comprobación eléctrica. Conserva fecha, hora, lecturas y notas para el soporte técnico.</Text></Panel>
      </ScreenScroller>
    </SafeAreaView>;
  };

  const BackupScreen = () => (
    <>
      <AppHeader title="RESPALDO" subtitle="Continuidad para cargas esenciales" connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.batteryPanel} styles={styles}>
          <View style={styles.batteryHeader}>
            <View><Text style={styles.overline}>BANCO DE BATERÍAS</Text><Text style={styles.batteryValue}>{Math.round(battery)}<Text style={styles.heroUnit}>%</Text></Text></View>
            <View style={[styles.batteryIconWrap, { borderColor: gridAvailable ? theme.success : theme.warning }]}><Ionicons name={gridAvailable ? "battery-charging" : "battery-half"} size={35} color={gridAvailable ? theme.success : theme.warning} /></View>
          </View>
          <ProgressBar value={battery} color={battery > 30 ? theme.success : theme.danger} styles={styles} theme={theme} />
          <View style={styles.batteryFooter}><Text style={styles.batteryFooterText}>{gridAvailable ? "CARGANDO DESDE LA RED" : "ALIMENTANDO CARGAS CRÍTICAS"}</Text><Text style={styles.batteryFooterText}>{gridAvailable ? battery >= 99.5 ? "CARGA COMPLETA" : `${formatDuration(estimatedChargeTime)} AL 100 %` : `${formatDuration(estimatedRuntime)} DE USO`}</Text></View>
        </Panel>
{showInformationModule("backup.summary") && <>
        <View style={styles.metricGrid}>
          <MetricCard icon="flash-outline" label="CARGA ESENCIAL" value={activeEssentialPower.toLocaleString("es-CL")} unit="W" styles={styles} theme={theme} />
          <MetricCard icon="time-outline" label="AUTONOMÍA APROX." value={formatDuration(estimatedRuntime)} unit="" styles={styles} theme={theme} />
          <MetricCard icon="battery-charging-outline" label="CARGA AL 100 %" value={battery >= 99.5 ? "Completa" : formatDuration(estimatedChargeTime)} unit={gridAvailable ? "" : "al volver red"} styles={styles} theme={theme} />
          <MetricCard icon="fitness-outline" label="VIDA DE BATERÍA" value={`${Math.round(batteryHealth)} %`} unit={batteryHealthLabel} styles={styles} theme={theme} />
        </View>
        </>}
        {showInformationModule("backup.health") && <Panel style={styles.batteryHealthPanel} styles={styles}>
          <SectionTitle title="ESTADO DE VIDA" caption="Estimación del banco según capacidad disponible, ciclos y temperatura" icon="heart-circle-outline" styles={styles} theme={theme} />
          <View style={styles.batteryHealthHero}><View><Text style={styles.batteryHealthLabel}>SALUD ESTIMADA</Text><Text style={[styles.batteryHealthState, { color: batteryHealthColor }]}>{batteryHealthLabel.toUpperCase()}</Text></View><Text style={[styles.batteryHealthPercent, { color: batteryHealthColor }]}>{Math.round(batteryHealth)}%</Text></View>
          <ProgressBar value={batteryHealth} color={batteryHealthColor} styles={styles} theme={theme} />
          <View style={styles.batteryHealthGrid}>
            <View style={styles.batteryHealthItem}><Text style={styles.batteryHealthItemLabel}>CAPACIDAD EFECTIVA</Text><Text style={styles.batteryHealthItemValue}>{effectiveBatteryCapacity.toFixed(2)} kWh</Text></View>
            <View style={styles.batteryHealthItem}><Text style={styles.batteryHealthItemLabel}>CICLOS REGISTRADOS</Text><Text style={styles.batteryHealthItemValue}>{Math.round(batteryCycles)}</Text></View>
            <View style={styles.batteryHealthItem}><Text style={styles.batteryHealthItemLabel}>TEMPERATURA</Text><Text style={styles.batteryHealthItemValue}>{batteryTemperature.toFixed(1)} °C</Text></View>
          </View>
          <Text style={styles.batteryHealthNote}>La autonomía varía según las cargas realmente activas, el estado de las baterías, la temperatura y las pérdidas del inversor.</Text>
        </Panel>}
        <Panel styles={styles}>
          <SectionTitle title="CIRCUITOS PROTEGIDOS" caption="Permanecen habilitados al retirar la tarjeta" icon="shield-outline" styles={styles} theme={theme} />
          {essentialCircuits.map((circuit, index) => <View key={circuit.id}>
            <View style={styles.protectedRow}><View style={styles.protectedIcon}><Ionicons name={circuit.icon} size={20} color={theme.accentBright} /></View><View style={{ flex: 1 }}><Text style={styles.protectedName}>{circuit.name}</Text><Text style={styles.protectedMeta}>{circuit.power} W nominales</Text></View><Ionicons name="shield-checkmark" size={21} color={theme.success} /></View>
            {index < essentialCircuits.length - 1 && <View style={styles.separator} />}
          </View>)}
          {essentialCircuits.length === 0 && <Text style={styles.emptyText}>No hay circuitos esenciales configurados.</Text>}
        </Panel>
        <Pressable accessibilityLabel={gridAvailable ? "Simular corte de energía" : "Restablecer red eléctrica"} onPress={toggleGrid} style={({ pressed }) => [styles.primaryButton, !gridAvailable && styles.primaryButtonWarning, pressed && styles.pressed]}><Ionicons name={gridAvailable ? "power-outline" : "flash-outline"} size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>{gridAvailable ? "SIMULAR CORTE DE ENERGÍA" : "RESTABLECER RED ELÉCTRICA"}</Text></Pressable>
        <Text style={styles.disclaimer}>Simulación de interfaz. La transferencia eléctrica real requiere equipos certificados y una instalación autorizada.</Text>
      </ScreenScroller>
    </>
  );

  const TechnicalScreen = () => (
    <>
      <AppHeader title="INICIO TÉCNICO" subtitle="Diagnóstico, comunicación y mantenimiento" connection={connection} styles={styles} theme={theme} technical pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.technicalBrandPanel} styles={styles}>
          <Image source={require("./assets/voltkey-tec-logo.png")} style={styles.technicalBrandLogo} resizeMode="contain" />
          <View style={styles.technicalBrandCopy}><Text style={styles.technicalBrandTitle}>IDENTIDAD TÉCNICA ACTIVA</Text><Text style={styles.technicalBrandText}>Entorno restringido para diagnóstico, mantención y procedimientos eléctricos.</Text></View>
        </Panel>
        <Panel style={styles.technicalNotice} styles={styles}>
          <Ionicons name="construct-outline" size={24} color={theme.warning} />
          <View style={{ flex: 1 }}><Text style={styles.alertTitle}>HERRAMIENTAS AVANZADAS</Text><Text style={styles.alertText}>Las lecturas ayudan al diagnóstico, pero no sustituyen mediciones certificadas ni procedimientos de bloqueo eléctrico.</Text></View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="CENTRO TÉCNICO" caption="Accesos rápidos para diagnóstico, trazabilidad y hardware" icon="construct-outline" styles={styles} theme={theme} />
          <View style={styles.dataActionGrid}>
            <Pressable accessibilityLabel="Abrir anomalías técnicas" onPress={() => setAnomalyCenterVisible(true)} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="warning-outline" size={23} color={anomalySummary.active ? theme.warning : theme.accentBright} /><Text style={styles.dataActionTitle}>ANOMALÍAS</Text><Text style={styles.dataActionText}>{anomalySummary.active ? `${anomalySummary.active} pendientes · ${anomalySummary.critical} críticas` : "Sin eventos pendientes"}</Text></Pressable>
            <Pressable accessibilityLabel="Abrir circuitos y hardware Arduino" onPress={() => setScreen("circuitos")} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="hardware-chip-outline" size={23} color={hardwareFirmwareReady ? theme.success : theme.warning} /><Text style={styles.dataActionTitle}>ARDUINO / RELÉS</Text><Text style={styles.dataActionText}>{hardwareFirmwareReady ? "Firmware físico confirmado" : hardwareBridge.connected ? "Revisar compatibilidad" : "Arduino desconectado"}</Text></Pressable>
            <Pressable accessibilityLabel="Abrir historial de energía" onPress={() => setScreen("energia")} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="analytics-outline" size={23} color={theme.accentBright} /><Text style={styles.dataActionTitle}>HISTORIAL</Text><Text style={styles.dataActionText}>{periodLabel} · {visibleHistory.length} registros</Text></Pressable>
            <Pressable accessibilityLabel={`Exportar informe técnico de ${periodLabel}`} disabled={exporting || historyLoading} onPress={downloadHistory} style={({ pressed }) => [styles.dataActionButton, (exporting || historyLoading) && styles.disabledButton, pressed && styles.pressed]}>{exporting ? <ActivityIndicator size="small" color={theme.accentBright} /> : <Ionicons name="document-attach-outline" size={23} color={theme.accentBright} />}<Text style={styles.dataActionTitle}>{exporting ? "GENERANDO…" : "INFORME EXCEL"}</Text><Text style={styles.dataActionText}>Lecturas, circuitos, anomalías y horarios</Text></Pressable>
          </View>
        </Panel>

        <Panel style={styles.technicalSessionPanel} styles={styles}>
          <SectionTitle title="SESIÓN DE MANTENIMIENTO" caption="El perfil permanece fijado hasta finalizar y salir de VoltKey Tec" icon="timer-outline" styles={styles} theme={theme} />
          <View style={styles.technicalSessionStats}><View><Text style={styles.technicalSessionLabel}>TIEMPO ACTIVO</Text><Text style={styles.technicalSessionValue}>{formatElapsedDuration(technicalClock - Date.parse(technicalSession?.startedAt || new Date().toISOString()))}</Text></View><StatusPill icon="lock-closed-outline" label="PERFIL FIJADO" color={theme.warning} styles={styles} /></View>
          <FormField label="RESPONSABLE" value={technicalSession?.responsible || activeProfile.name} onChangeText={(value) => setTechnicalSession((current) => ({ ...(current || { startedAt: new Date().toISOString(), status: "active" }), responsible: value.slice(0, 50) }))} placeholder="Nombre del responsable" styles={styles} maxLength={50} />
          <FormField label="TRABAJO O MOTIVO" value={technicalSession?.task || ""} onChangeText={(value) => setTechnicalSession((current) => ({ ...(current || { startedAt: new Date().toISOString(), status: "active" }), task: value.slice(0, 120) }))} placeholder="Ej.: revisión del circuito de iluminación" styles={styles} maxLength={120} />
          <Pressable feedback="confirm" accessibilityLabel="Guardar datos de la sesión técnica" onPress={saveTechnicalSessionDetails} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="save-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>GUARDAR DATOS DE SESIÓN</Text></Pressable>
        </Panel>

        <Panel style={styles.goldenRulesPanel} styles={styles}>
          <SectionTitle title="5 REGLAS DE ORO" caption="Secuencia de seguridad antes de trabajar sin tensión" icon="shield-checkmark-outline" styles={styles} theme={theme} />
          {ELECTRICAL_GOLDEN_RULES.map((rule, index) => <View key={rule.id}>
            <View style={styles.goldenRuleRow}>
              <View style={styles.goldenRuleNumber}><Text style={styles.goldenRuleNumberText}>{rule.id}</Text></View>
              <View style={{ flex: 1 }}><Text style={styles.goldenRuleTitle}>{rule.title}</Text><Text style={styles.goldenRuleText}>{rule.text}</Text></View>
            </View>
            {index < ELECTRICAL_GOLDEN_RULES.length - 1 && <View style={styles.separator} />}
          </View>)}
          <View style={styles.safetyReminder}><Ionicons name="warning" size={20} color={theme.warning} /><Text style={styles.safetyReminderText}>Solo personal autorizado o cualificado debe intervenir. Usa EPP, el procedimiento local y los instrumentos apropiados.</Text></View>
          <Pressable accessibilityLabel="Abrir referencia de las cinco reglas de oro" onPress={() => Linking.openURL("https://capacitacion.achs.cl/capacitaciones/seguridad-en-distribucion-electrica-reglas-de-oro-y-equipo-de-proteccion-presencial").catch(() => {})} style={({ pressed }) => [styles.goldenRulesSource, pressed && styles.pressed]}><Ionicons name="open-outline" size={16} color={theme.accentBright} /><Text style={styles.goldenRulesSourceText}>CONSULTAR REFERENCIA ACHS</Text></Pressable>
        </Panel>

        <SectionTitle title="LECTURA EN VIVO" caption="Valores recibidos o calculados a partir del medidor" icon="pulse-outline" styles={styles} theme={theme} />
        <View style={styles.metricGrid}>
          <MetricCard icon="speedometer-outline" label="TENSIÓN" value={voltage.toFixed(1)} unit="V" styles={styles} theme={theme} onPress={() => setMetricModalId("voltage")} />
          <MetricCard icon="git-compare-outline" label="DESVIACIÓN" value={`${voltageDeviation >= 0 ? "+" : ""}${voltageDeviation.toFixed(2)}`} unit="%" styles={styles} theme={theme} />
          <MetricCard icon="pulse-outline" label="CORRIENTE CALC." value={current.toFixed(2)} unit="A" styles={styles} theme={theme} onPress={() => setMetricModalId("current")} />
          <MetricCard icon="flash-outline" label="POTENCIA ACTIVA" value={power.toLocaleString("es-CL")} unit="W" styles={styles} theme={theme} />
        </View>

        <Panel styles={styles}>
          <SectionTitle title="DIAGNÓSTICO DEL SISTEMA" caption="Comunicación y calidad de los datos" icon="terminal-outline" styles={styles} theme={theme} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Estabilidad del enlace</Text><StatusPill icon={connectionQuality === "Estable" ? "checkmark-circle-outline" : "warning-outline"} label={connectionQuality.toUpperCase()} color={connectionQuality === "Estable" ? theme.success : connection === "online" ? theme.warning : theme.danger} styles={styles} /></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Latencia / última trama</Text><Text style={styles.diagnosticValue}>{latency === null ? "—" : `${latency} ms`} · {lastSyncAt ? dateTimeLabel(lastSyncAt) : "sin datos"}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Servidor WebSocket</Text><Text style={styles.diagnosticValue} numberOfLines={1}>{WS_URL ? String(WS_URL).replace(/^wss?:\/\//, "").split("/")[0] : "no configurado"}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Clientes / fuente</Text><Text style={styles.diagnosticValue}>{connectedClients.length} · {historySource === "simulation" ? "simulación" : historySource === "mixed" ? "mixta" : "medidor"}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Anomalías en {periodLabel.toLowerCase()}</Text><Text style={[styles.diagnosticValue, { color: technicalAnomalies ? theme.warning : theme.success }]}>{technicalAnomalies}</Text></View>
          <View style={styles.technicalActionGrid}>
            <Pressable accessibilityLabel="Actualizar diagnóstico técnico" onPress={runTechnicalDiagnostic} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, pressed && styles.pressed]}><Ionicons name="scan-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>{historyLoading ? "ACTUALIZANDO…" : "ACTUALIZAR DIAGNÓSTICO"}</Text></Pressable>
            <Pressable accessibilityLabel="Reconectar con el servidor" onPress={reconnectNow} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, pressed && styles.pressed]}><Ionicons name="refresh-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>REINICIAR ENLACE</Text></Pressable>
          </View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="SALUD FÍSICA Y TRAZABILIDAD" caption="Compara la aplicación con el controlador y la fuente de medición" icon="hardware-chip-outline" styles={styles} theme={theme} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Arduino UNO R3</Text><StatusPill icon={hardwareBridge.connected ? "checkmark-circle-outline" : "usb-outline"} label={hardwareBridge.connected ? "CONECTADO" : "DESCONECTADO"} color={hardwareBridge.connected ? theme.success : theme.warning} styles={styles} /></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Compatibilidad física</Text><Text style={[styles.diagnosticValue, { color: hardwareFirmwareReady ? theme.success : theme.warning }]}>{hardwareFirmwareReady ? "FIRMWARE COMPATIBLE" : hardwareBridge.connected ? "REVISAR FIRMWARE" : "SIN ENLACE USB"}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Tarjeta / red</Text><Text style={styles.diagnosticValue}>{cardInserted ? "INSERTADA" : "RETIRADA"} · {gridAvailable ? "RED DISPONIBLE" : "CORTE / RESPALDO"}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Relés con estado físico</Text><Text style={styles.diagnosticValue}>{Object.values(hardwareBridge.relayIndicatorStates || {}).filter((value) => typeof value === "boolean").length}/3 confirmados</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Fuente de lecturas</Text><Text style={styles.diagnosticValue}>{historySource === "simulation" ? "SIMULACIÓN" : historySource === "mixed" ? "MIXTA" : "MEDIDOR / TELEMETRÍA"}</Text></View>
          <View style={styles.technicalActionGrid}>
            <Pressable accessibilityLabel="Abrir configuración física Arduino" onPress={() => setScreen("circuitos")} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, pressed && styles.pressed]}><Ionicons name="hardware-chip-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>REVISAR HARDWARE</Text></Pressable>
            <Pressable feedback="confirm" accessibilityLabel="Ejecutar autoprueba del Arduino" disabled={!hardwareFirmwareReady} onPress={() => sendCommand({ type: "run_hardware_self_test", commandId: `selftest-tech-${Date.now()}` })} style={({ pressed }) => [styles.secondaryButton, styles.technicalAction, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="checkmark-done-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>AUTOPRUEBA UNO</Text></Pressable>
          </View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="ANOMALÍAS Y SEGUIMIENTO" caption="Trazabilidad de eventos eléctricos del periodo seleccionado" icon="warning-outline" styles={styles} theme={theme} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Pendientes</Text><Text style={[styles.diagnosticValue, { color: anomalySummary.active ? theme.warning : theme.success }]}>{anomalySummary.active}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Críticas</Text><Text style={[styles.diagnosticValue, { color: anomalySummary.critical ? theme.danger : theme.success }]}>{anomalySummary.critical}</Text></View>
          <View style={styles.separator} />
          <View style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>Resueltas / archivadas</Text><Text style={styles.diagnosticValue}>{anomalySummary.resolved}</Text></View>
          <Pressable accessibilityLabel="Abrir centro de anomalías y notas" onPress={() => setAnomalyCenterVisible(true)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="document-text-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>ABRIR TRAZABILIDAD</Text></Pressable>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="INVENTARIO ELÉCTRICO" caption="Datos nominales registrados por circuito" icon="list-outline" styles={styles} theme={theme} />
          {circuits.map((circuit, index) => <View key={`tech-${circuit.id}`}>
            <View style={styles.technicalCircuitRow}>
              <View style={[styles.circuitIcon, circuit.essential && styles.essentialButtonActive]}><Ionicons name={circuit.icon || "flash-outline"} size={20} color={circuit.essential ? theme.accentBright : theme.muted} /></View>
              <View style={{ flex: 1 }}><Text style={styles.circuitName}>{circuit.name}</Text><Text style={styles.circuitMeta}>{Number(circuit.power || 0).toLocaleString("es-CL")} W · {Number(circuit.voltage || 220).toFixed(0)} V · {Number(circuit.current || (circuit.power / Math.max(circuit.voltage || 220, 1))).toFixed(2)} A</Text></View>
              <Text style={styles.technicalCircuitBadge}>{circuit.essential ? "ESENCIAL" : circuit.on ? "ACTIVO" : "OFF"}</Text>
            </View>
            {index < circuits.length - 1 && <View style={styles.separator} />}
          </View>)}
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="MANTENIMIENTO PREVENTIVO" caption={`${completedMaintenance}/${MAINTENANCE_TASKS.length} verificaciones registradas en este dispositivo`} icon="checkbox-outline" styles={styles} theme={theme} />
          {MAINTENANCE_TASKS.map((task, index) => <View key={task.id}>
            <Pressable accessibilityLabel={`${task.title}: ${maintenanceChecks[task.id] ? "completado" : "pendiente"}`} onPress={() => toggleMaintenanceTask(task.id)} style={({ pressed }) => [styles.maintenanceRow, pressed && styles.pressed]}>
              <Ionicons name={maintenanceChecks[task.id] ? "checkmark-circle" : "ellipse-outline"} size={23} color={maintenanceChecks[task.id] ? theme.success : theme.muted} />
              <View style={{ flex: 1 }}><View style={styles.maintenanceTitleRow}><Text style={styles.maintenanceTitle}>{task.title}</Text><Text style={styles.maintenanceInterval}>{task.interval}</Text></View><Text style={styles.maintenanceText}>{task.text}</Text>{maintenanceChecks[task.id] && <Text style={styles.maintenanceDone}>REGISTRADO: {dateTimeLabel(maintenanceChecks[task.id]).toUpperCase()}</Text>}</View>
            </Pressable>
            {index < MAINTENANCE_TASKS.length - 1 && <View style={styles.separator} />}
          </View>)}
        </Panel>
        <Text style={styles.disclaimer}>Cualquier intervención dentro del tablero, prueba energizada o modificación de protecciones debe realizarla personal autorizado con los elementos de seguridad correspondientes.</Text>
        <Pressable accessibilityLabel="Salir de VoltKey Tec" onPress={() => changeUserMode("home")} style={({ pressed }) => [styles.exitTechnicalButton, pressed && styles.pressed]}><Ionicons name="exit-outline" size={21} color={theme.text} /><View style={{ flex: 1 }}><Text style={styles.exitTechnicalTitle}>SALIR DE VOLTKEY TEC</Text><Text style={styles.exitTechnicalText}>Restaurar paleta y controles habituales</Text></View><Ionicons name="chevron-forward" size={20} color={theme.text} /></Pressable>
      </ScreenScroller>
    </>
  );

  const TutorialScreen = () => {
    const completed = new Set(activeIntroProgress.completed || []);
    const techCompleted = new Set(activeIntroProgress.techCompleted || []);
    const currentStageMissions = introRoute.filter((mission) => mission.stage === introStage);
    const stageCompleted = currentStageMissions.filter((mission) => completed.has(mission.id)).length;
    const overallPercent = Math.round(introCompletedCount / Math.max(introRoute.length, 1) * 100);
    const techUnlocked = !isChildProfile && introRouteCompleted;
    const techPercent = Math.round(TECH_INTRO_MISSIONS.filter((mission) => techCompleted.has(mission.id)).length / TECH_INTRO_MISSIONS.length * 100);
    const stageDescription = introStage === 3 ? "Empieza con lo mínimo necesario. Al completar estas misiones pasarás al Perfil 2." : introStage === 2 ? "Ya tienes más información visible. Estas misiones presentan los bloques nuevos antes de pasar al Perfil 1." : "Tienes toda la información disponible. Completa esta etapa para cerrar la introducción.";
    const missionCard = (mission, done, technicalMission = false) => <Panel key={mission.id} style={[styles.tutorialReasonCard, done && styles.ecoTipCardCompleted]} styles={styles}>
      <View style={styles.tutorialFlowRow}><View style={styles.feedbackSettingIcon}><Ionicons name={done ? "checkmark-circle" : mission.icon} size={22} color={done ? theme.success : theme.accentBright} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>{mission.title}</Text><Text style={styles.formSwitchHelp}>{mission.text}</Text></View></View>
      <View style={styles.feedbackActionGrid}><Pressable accessibilityLabel={`Ir a ${mission.title}`} onPress={() => openMissionTarget(mission)} style={({ pressed }) => [styles.secondaryButton, styles.feedbackAction, pressed && styles.pressed]}><Ionicons name="navigate-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>IR A LA FUNCIÓN</Text></Pressable><Pressable feedback="confirm" accessibilityLabel={`Completar misión ${mission.title}`} disabled={done} onPress={() => completeIntroMission(mission, technicalMission)} style={({ pressed }) => [styles.primaryButton, styles.feedbackAction, done && styles.disabledButton, pressed && styles.pressed]}><Ionicons name={done ? "trophy" : "trophy-outline"} size={18} color={theme.onAccent} /><Text style={styles.primaryButtonText}>{done ? "LOGRO CONSEGUIDO" : "MARCAR COMPLETADA"}</Text></Pressable></View>
      <Text style={[styles.smartCardSettingsHint, { color: done ? theme.success : theme.muted }]}>LOGRO · {mission.achievement.toUpperCase()}</Text>
    </Panel>;
    return <>
      <AppHeader title="TUTORIAL · MISIONES" subtitle={`Ruta de ${isChildProfile ? "VoltKids" : userMode === "technical" ? "VoltKey Tec" : "Administrador"}`} connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.tutorialHeroPanel} styles={styles}>
          <View style={styles.tutorialHeroIcon}><Ionicons name="trophy-outline" size={38} color={theme.accentBright} /></View>
          <View style={{ flex: 1 }}><Text style={styles.tutorialHeroEyebrow}>{EDITION_LABEL}</Text><Text style={styles.tutorialHeroTitle}>{activeIntroProgress.skipped ? "INTRODUCCIÓN OMITIDA" : `PERFIL DE INFORMACIÓN ${currentInformationSetting.preset === "custom" ? "PERSONALIZADO" : currentInformationPreset}`}</Text><Text style={styles.tutorialHeroText}>{activeIntroProgress.skipped ? "Elegiste usar VoltKey con toda la información. Las misiones siguen disponibles como guía opcional y puedes reiniciarlas cuando quieras." : stageDescription}</Text></View>
        </Panel>

        <Panel styles={styles}>
          <SectionTitle title="PROGRESO DE INTRODUCCIÓN" caption={`${introCompletedCount}/${introRoute.length} misiones · ${overallPercent}%`} icon="ribbon-outline" styles={styles} theme={theme} />
          <ProgressBar value={overallPercent} color={theme.success} styles={styles} theme={theme} />
          <View style={styles.feedbackActionGrid}><Pressable accessibilityLabel="Abrir guía rápida clásica" onPress={() => { setTutorialStep(0); setTutorialVisible(true); }} style={({ pressed }) => [styles.secondaryButton, styles.feedbackAction, pressed && styles.pressed]}><Ionicons name="help-buoy-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>GUÍA RÁPIDA</Text></Pressable><Pressable accessibilityLabel="Reiniciar ruta de introducción" onPress={() => confirmChoice("¿Reiniciar introducción?", "El progreso de misiones de este perfil volverá a cero y la interfaz regresará al Perfil de información 3.", "Reiniciar", resetMissionIntroduction)} style={({ pressed }) => [styles.secondaryButton, styles.feedbackAction, pressed && styles.pressed]}><Ionicons name="refresh-outline" size={18} color={theme.warning} /><Text style={[styles.secondaryButtonText, { color: theme.warning }]}>REINICIAR RUTA</Text></Pressable></View>
        </Panel>

        {!activeIntroProgress.skipped && !introRouteCompleted && <>
          <SectionTitle title={`ETAPA · PERFIL ${introStage}`} caption={`${stageCompleted}/${currentStageMissions.length} logros de esta etapa`} icon="flag-outline" styles={styles} theme={theme} />
          <View style={styles.tutorialReasonGrid}>{currentStageMissions.map((mission) => missionCard(mission, completed.has(mission.id)))}</View>
        </>}

        {introRouteCompleted && <Panel style={styles.permissionIntroPanel} styles={styles}><Ionicons name="trophy" size={27} color={theme.success} /><View style={{ flex: 1 }}><Text style={styles.permissionEmptyTitle}>{isChildProfile ? "RUTA VOLTKIDS COMPLETADA" : "RUTA ADMINISTRADOR COMPLETADA"}</Text><Text style={styles.permissionIntroText}>{isChildProfile ? "Ya conoces los controles, permisos, aprendizaje y opciones principales de tu perfil." : "Ya conoces la aplicación principal. Desde ahora las misiones avanzadas de VoltKey Tec están disponibles."}</Text></View></Panel>}

        {!introRouteCompleted && !activeIntroProgress.skipped && <Pressable accessibilityLabel="Omitir ruta de introducción" onPress={() => confirmChoice("¿Omitir introducción?", "VoltKey activará el Perfil de información 1 para este usuario. Podrás reiniciar las misiones desde este mismo Tutorial.", "Omitir", skipMissionIntroduction)} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="play-skip-forward-outline" size={18} color={theme.muted} /><Text style={[styles.secondaryButtonText, { color: theme.muted }]}>OMITIR INTRODUCCIÓN</Text></Pressable>}

        {techUnlocked && <>
          <SectionTitle title="MISIONES VOLTKEY TEC" caption={`Ruta avanzada desbloqueada · ${techPercent}% completado`} icon="construct-outline" styles={styles} theme={theme} />
          {userMode !== "technical" ? <Panel styles={styles}><View style={styles.tutorialWindowRow}><View style={styles.feedbackSettingIcon}><Ionicons name="lock-open-outline" size={23} color={theme.success} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>RUTA TÉCNICA DESBLOQUEADA</Text><Text style={styles.formSwitchHelp}>Entra a VoltKey Tec desde Ajustes. Dentro del modo técnico vuelve a Tutorial para completar diagnóstico, hardware, mantenimiento y seguridad.</Text></View></View><Pressable feedback="confirm" accessibilityLabel="Ir a Ajustes para entrar a VoltKey Tec" onPress={() => setScreen("ajustes")} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Ionicons name="construct-outline" size={19} color={theme.onAccent} /><Text style={styles.primaryButtonText}>IR A AJUSTES</Text></Pressable></Panel> : <View style={styles.tutorialReasonGrid}>{TECH_INTRO_MISSIONS.map((mission) => missionCard(mission, techCompleted.has(mission.id), true))}</View>}
        </>}

        <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="shield-checkmark-outline" size={24} color={theme.warning} /><Text style={styles.anomalySafetyText}>Las misiones enseñan a usar la aplicación. No autorizan intervenciones en tableros, protecciones ni circuitos energizados; esas tareas requieren personal capacitado y procedimientos de seguridad.</Text></Panel>
      </ScreenScroller>
    </>;
  };

  const ChildSettingsScreen = () => (
    <>
      <AppHeader title="AJUSTES VOLTKIDS" subtitle="Acceso protegido y preferencias seguras" connection={connection} styles={styles} theme={theme} kids profile={activeProfile} onProfilePress={() => setProfileSwitcherVisible(true)} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.childExitPanel} styles={styles}>
          <View style={styles.childWelcomeIcon}><Ionicons name="lock-open-outline" size={31} color={theme.accentBright} /></View>
          <View style={{ flex: 1 }}><Text style={styles.childWelcomeTitle}>VOLVER A VOLTKEY NORMAL</Text><Text style={styles.childWelcomeText}>Selecciona un perfil administrador. VoltKey solicitará su PIN de cuatro dígitos antes de liberar el control completo.</Text></View>
          <Pressable feedback="confirm" accessibilityLabel="Cambiar a perfil administrador" onPress={() => setProfileSwitcherVisible(true)} style={({ pressed }) => [styles.primaryButton, styles.childExitButton, pressed && styles.pressed]}><Ionicons name="key-outline" size={19} color={theme.onAccent} /><Text style={styles.primaryButtonText}>CAMBIAR PERFIL</Text></Pressable>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="SONIDO Y VIBRACIÓN" caption="Estas preferencias no cambian permisos ni circuitos" icon="options-outline" styles={styles} theme={theme} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={soundsEnabled ? "volume-medium-outline" : "volume-mute-outline"} size={22} color={soundsEnabled ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>SONIDOS DE INTERFAZ</Text><Text style={styles.formSwitchHelp}>Respuesta suave al usar botones y controles autorizados.</Text></View><Switch value={soundsEnabled} onValueChange={onSoundsEnabledChange} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={soundsEnabled ? theme.accentBright : theme.muted} /></View>
          <View style={styles.separator} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={hapticsEnabled ? "phone-portrait-outline" : "remove-circle-outline"} size={22} color={hapticsEnabled ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>VIBRACIÓN TÁCTIL</Text><Text style={styles.formSwitchHelp}>Pulsos breves en el celular.</Text></View><Switch value={hapticsEnabled} onValueChange={onHapticsEnabledChange} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={hapticsEnabled ? theme.accentBright : theme.muted} /></View>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="TUTORIAL" caption="Explica qué es VoltKey sin dar acceso a opciones administrativas" icon="school-outline" styles={styles} theme={theme} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name="school-outline" size={22} color={theme.accentBright} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>MOSTRAR PESTAÑA TUTORIAL</Text><Text style={styles.formSwitchHelp}>{tutorialTabVisible ? "Visible en la navegación de este dispositivo." : "Oculta; actívala para volver a verla."}</Text></View><Switch value={tutorialTabVisible} onValueChange={setTutorialTabVisible} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={tutorialTabVisible ? theme.accentBright : theme.muted} /></View>
          <Pressable accessibilityLabel="Abrir tutorial de VoltKey" onPress={() => { setTutorialTabVisible(true); setScreen("tutorial"); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="book-outline" size={19} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>ABRIR MISIONES</Text></Pressable>
        </Panel>
        <InformationPreferencesPanel child />
        <Panel style={styles.anomalySafetyPanel} styles={styles}><Ionicons name="shield-checkmark-outline" size={23} color={theme.success} /><Text style={styles.anomalySafetyText}>Este Ajustes limitado existe para evitar el bloqueo anterior. VoltKids no puede ver configuración eléctrica, perfiles familiares ni herramientas técnicas.</Text></Panel>
      </ScreenScroller>
    </>
  );

  const SettingsScreen = () => (
    <>
      <AppHeader title="AJUSTES" subtitle="Perfil, interfaz y personalización" connection={connection} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} profile={activeProfile} onProfilePress={() => setProfileSwitcherVisible(true)} pendingRequests={unifiedNotifications.length} onRequestsPress={() => setNotificationCenterVisible(true)} />
      <ScreenScroller desktop={isDesktopLayout} styles={styles} theme={theme}>
        <Panel style={styles.aboutPanel} styles={styles}>
          <BrandMark technical={userMode === "technical"} size={84} style={styles.aboutLogo} />
          <View style={styles.aboutContent}>
            <Text style={styles.aboutEyebrow}>IDENTIDAD DE LA APLICACIÓN</Text>
            <Text style={styles.aboutName}>{userMode === "technical" ? "VOLTKEY TEC" : "VOLTKEY"}</Text>
            <Text style={styles.aboutVersion}>{EDITION_LABEL}</Text>
            <Text style={styles.aboutText}>VoltKey existe para hacer comprensible el tablero eléctrico, reducir desperdicios y comprobar que cada orden digital llegó realmente al Arduino.</Text>
          </View>
        </Panel>
        <Panel styles={styles}>
          <SectionTitle title="PESTAÑA TUTORIAL" caption="Misiones, logros y ruta progresiva de aprendizaje" icon="school-outline" styles={styles} theme={theme} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={tutorialTabVisible ? "eye-outline" : "eye-off-outline"} size={22} color={tutorialTabVisible ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>MOSTRAR SEXTA VENTANA</Text><Text style={styles.formSwitchHelp}>{tutorialTabVisible ? "Tutorial aparece en la navegación de este perfil." : "Tutorial está oculto; tus misiones y logros se conservan."}</Text></View><Switch value={tutorialTabVisible} onValueChange={setTutorialTabVisible} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={tutorialTabVisible ? theme.accentBright : theme.muted} /></View>
          <Pressable accessibilityLabel="Mostrar y abrir Tutorial" onPress={() => { setTutorialTabVisible(true); setScreen("tutorial"); }} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Ionicons name="book-outline" size={19} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>{tutorialTabVisible ? "ABRIR TUTORIAL" : "RESTAURAR Y ABRIR TUTORIAL"}</Text></Pressable>
          <Text style={styles.smartCardSettingsHint}>Ocultarla no borra el tutorial. Puedes recuperarla desde este mismo sector.</Text>
        </Panel>
        {userMode !== "technical" && <InformationPreferencesPanel />}
        <Panel styles={styles}>
          <SectionTitle title="SONIDO Y VIBRACIÓN" caption="Respuesta suave diseñada para escucharse repetidamente sin resultar invasiva" icon="options-outline" styles={styles} theme={theme} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={soundsEnabled ? "volume-medium-outline" : "volume-mute-outline"} size={22} color={soundsEnabled ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>SONIDOS DE INTERFAZ</Text><Text style={styles.formSwitchHelp}>Botones, circuitos, confirmaciones, alertas y transiciones.</Text></View><Switch value={soundsEnabled} onValueChange={onSoundsEnabledChange} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={soundsEnabled ? theme.accentBright : theme.muted} /></View>
          <View style={styles.separator} />
          <View style={styles.feedbackSettingRow}><View style={styles.feedbackSettingIcon}><Ionicons name={hapticsEnabled ? "phone-portrait-outline" : "remove-circle-outline"} size={22} color={hapticsEnabled ? theme.accentBright : theme.muted} /></View><View style={{ flex: 1 }}><Text style={styles.formSwitchTitle}>VIBRACIÓN TÁCTIL</Text><Text style={styles.formSwitchHelp}>Pulsos breves en celular; no se utiliza en la interfaz web.</Text></View><Switch value={hapticsEnabled} onValueChange={onHapticsEnabledChange} trackColor={{ false: theme.border, true: theme.accentDim }} thumbColor={hapticsEnabled ? theme.accentBright : theme.muted} /></View>
          <View style={styles.feedbackActionGrid}><Pressable feedback="confirm" accessibilityLabel="Probar respuesta de interfaz" disabled={!soundsEnabled && !hapticsEnabled} onPress={() => setEventMessage("Respuesta de interfaz comprobada")} style={({ pressed }) => [styles.secondaryButton, styles.feedbackAction, !soundsEnabled && !hapticsEnabled && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="play-outline" size={18} color={theme.accentBright} /><Text style={styles.secondaryButtonText}>PROBAR</Text></Pressable><Pressable accessibilityLabel="Desactivar sonido y vibración" disabled={!soundsEnabled && !hapticsEnabled} onPress={() => { onSoundsEnabledChange(false); onHapticsEnabledChange(false); }} style={({ pressed }) => [styles.secondaryButton, styles.feedbackAction, !soundsEnabled && !hapticsEnabled && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="moon-outline" size={18} color={theme.muted} /><Text style={[styles.secondaryButtonText, { color: theme.muted }]}>SILENCIO TOTAL</Text></Pressable></View>
        </Panel>
        {!isChildProfile && userMode !== "technical" && <Panel styles={styles}>
          <SectionTitle title="DATOS Y TRAZABILIDAD" caption="Historial, recuperación, guía y copias de seguridad" icon="file-tray-stacked-outline" styles={styles} theme={theme} />
          <View style={styles.dataActionGrid}>
            <Pressable accessibilityLabel="Abrir historial de actividad" onPress={() => setActivityLogVisible(true)} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="time-outline" size={23} color={theme.accentBright} /><Text style={styles.dataActionTitle}>HISTORIAL</Text><Text style={styles.dataActionText}>{activityLog.length} acciones registradas</Text></Pressable>
            <Pressable feedback="confirm" accessibilityLabel="Crear copia de seguridad" onPress={exportConfigurationBackup} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="cloud-download-outline" size={23} color={theme.accentBright} /><Text style={styles.dataActionTitle}>RESPALDAR</Text><Text style={styles.dataActionText}>Circuitos, perfiles y ajustes</Text></Pressable>
            <Pressable accessibilityLabel="Restaurar copia de seguridad" onPress={() => { setBackupRestoreText(""); setBackupRestoreVisible(true); }} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="cloud-upload-outline" size={23} color={theme.accentBright} /><Text style={styles.dataActionTitle}>RESTAURAR</Text><Text style={styles.dataActionText}>Validación antes de aplicar</Text></Pressable>
            <Pressable accessibilityLabel="Abrir guía rápida" onPress={() => { setTutorialStep(0); setTutorialVisible(true); }} style={({ pressed }) => [styles.dataActionButton, pressed && styles.pressed]}><Ionicons name="help-buoy-outline" size={23} color={theme.accentBright} /><Text style={styles.dataActionTitle}>GUÍA RÁPIDA</Text><Text style={styles.dataActionText}>Recorrido por las funciones</Text></Pressable>
          </View>
        </Panel>}
        <Panel style={styles.smartCardSettingsPanel} styles={styles}>
          <View style={styles.smartCardSettingsHeader}>
            <View style={styles.smartCardSettingsIcon}><Ionicons name="card" size={31} color={theme.accentBright} /></View>
            <View style={{ flex: 1 }}><Text style={styles.smartCardSettingsEyebrow}>TARJETERO INTELIGENTE</Text><Text style={[styles.smartCardSettingsState, { color: cardInserted ? theme.success : theme.warning }]}>{cardInserted ? "VIVIENDA HABILITADA" : shutdownSeconds !== null ? `APAGADO EN ${shutdownSeconds} SEGUNDOS` : "MODO SOLO ESENCIALES"}</Text></View>
            <StatusPill icon={cardInserted ? "checkmark-circle-outline" : "shield-outline"} label={cardInserted ? "INSERTADA" : "RETIRADA"} color={cardInserted ? theme.success : theme.warning} styles={styles} />
          </View>
          <View style={styles.smartCardSpecGrid}>
            <View style={styles.smartCardSpec}><Text style={styles.smartCardSpecLabel}>RETARDO</Text><Text style={styles.smartCardSpecValue}>5 segundos</Text></View>
            <View style={styles.smartCardSpec}><Text style={styles.smartCardSpecLabel}>POLÍTICA</Text><Text style={styles.smartCardSpecValue}>Solo no esenciales</Text></View>
            <View style={styles.smartCardSpec}><Text style={styles.smartCardSpecLabel}>PROTEGIDOS</Text><Text style={styles.smartCardSpecValue}>{essentialCircuits.length} circuitos</Text></View>
            <View style={styles.smartCardSpec}><Text style={styles.smartCardSpecLabel}>RESTAURACIÓN</Text><Text style={styles.smartCardSpecValue}>Automática</Text></View>
            <View style={styles.smartCardSpec}><Text style={styles.smartCardSpecLabel}>LED TARJETA · D{cardLedConfig.pin}</Text><Text style={styles.smartCardSpecValue}>{cardLedStatusText}</Text></View>
          </View>
          <Pressable accessibilityLabel={cardInserted ? "Retirar tarjeta inteligente" : "Insertar tarjeta inteligente"} onPress={toggleCard} style={({ pressed }) => [styles.smartCardSettingsButton, !cardInserted && styles.smartCardSettingsButtonRestore, pressed && styles.pressed]}><Ionicons name={cardInserted ? "log-out-outline" : "log-in-outline"} size={21} color={theme.onAccent} /><Text style={styles.smartCardSettingsButtonText}>{shutdownSeconds !== null ? "CANCELAR APAGADO E INSERTAR" : cardInserted ? "RETIRAR TARJETA" : "INSERTAR TARJETA"}</Text></Pressable>
          {shutdownSeconds !== null && <Text style={styles.smartCardSettingsHint}>Puedes cancelar antes de que VoltKey desconecte las cargas no esenciales.</Text>}
        </Panel>
        {userMode !== "technical" && <>
        <SectionTitle title="PERFILES FAMILIARES" caption="Añade administradores o perfiles VoltKids y define sus permisos" icon="people-circle-outline" styles={styles} theme={theme} />
        <Panel style={styles.profileManagerList} styles={styles}>
          {managedProfiles.map((profile, index) => <View key={`manager-${profile.id}`}>
            <Pressable accessibilityLabel={`Editar perfil ${profile.name}`} onPress={() => openEditProfile(profile)} style={({ pressed }) => [styles.profileManagerRow, pressed && styles.pressed]}>
              <View style={[styles.profileManagerIcon, profile.id === activeProfileId && styles.profileManagerIconActive]}><Ionicons name={profile.icon || "person-outline"} size={22} color={profile.id === activeProfileId ? theme.accentBright : theme.muted} /></View>
              <View style={{ flex: 1 }}><View style={styles.profileManagerNameRow}><Text style={styles.profileManagerName}>{profile.name}</Text>{profile.id === activeProfileId && <Text style={styles.profileActiveBadge}>ACTIVO</Text>}</View><Text style={styles.profileManagerMeta}>{profile.role === "child" ? `VoltKids · ${profile.allowedCircuitIds?.length || 0} circuitos permitidos` : `Administrador · control absoluto · ${profile.pinHash ? "PIN configurado" : "PIN pendiente"}`}</Text></View>
              <Ionicons name="create-outline" size={20} color={theme.accentBright} />
            </Pressable>
            {index < managedProfiles.length - 1 && <View style={styles.separator} />}
          </View>)}
        </Panel>
        <Pressable accessibilityLabel="Añadir perfil familiar" onPress={openNewProfile} style={({ pressed }) => [styles.profileAddButton, pressed && styles.pressed]}><View style={styles.profileAddIcon}><Ionicons name="person-add-outline" size={22} color={theme.onAccent} /></View><View style={{ flex: 1 }}><Text style={styles.profileAddTitle}>AÑADIR PERFIL</Text><Text style={styles.profileAddText}>Administrador o VoltKids con permisos personalizados</Text></View><Ionicons name="chevron-forward" size={20} color={theme.accentBright} /></Pressable>
        <SectionTitle title="PERFIL DE USO" caption="Separa la operación cotidiana de las herramientas para especialistas" icon="people-outline" styles={styles} theme={theme} />
        <View style={styles.modeGrid}>{USER_MODES.map((mode) => {
          const selected = userMode === mode.id;
          return <Pressable key={mode.id} accessibilityLabel={mode.label} onPress={() => changeUserMode(mode.id)} style={({ pressed }) => [styles.modeOption, selected && styles.optionSelected, pressed && styles.pressed]}>
            <View style={[styles.modeIcon, selected && styles.modeIconSelected]}><Ionicons name={mode.icon} size={23} color={selected ? theme.accentBright : theme.muted} /></View>
            <Text style={styles.modeTitle}>{mode.label}</Text><Text style={styles.modeDescription}>{mode.description}</Text>
            <View style={styles.modeSelectedRow}><Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={selected ? theme.accentBright : theme.muted} /><Text style={[styles.modeSelectedText, selected && { color: theme.accentBright }]}>{selected ? "ACTIVO" : "SELECCIONAR"}</Text></View>
          </Pressable>;
        })}</View>
        </>}
        {!isChildProfile && <>
        <SectionTitle title="VISTA DE CIRCUITOS" caption="Elige cómo quieres ver los circuitos; esta opción ya no ocupa espacio dentro de Circuitos" icon="apps-outline" styles={styles} theme={theme} />
        <Panel styles={styles}>
          <View style={styles.circuitViewSelector}>{CIRCUIT_VIEW_MODES.map((viewMode) => {
            const selected = circuitViewMode === viewMode.id;
            return <Pressable key={viewMode.id} accessibilityLabel={`Vista de circuitos: ${viewMode.label}`} onPress={() => changeCircuitViewMode(viewMode.id)} style={({ pressed }) => [styles.circuitViewOption, selected && styles.circuitViewOptionActive, pressed && styles.pressed]}>
              <Ionicons name={viewMode.icon} size={21} color={selected ? theme.accentBright : theme.muted} />
              <View style={{ flex: 1 }}><Text style={[styles.circuitViewTitle, selected && styles.circuitViewTitleActive]}>{viewMode.label}</Text><Text style={styles.circuitViewText}>{viewMode.description}</Text></View>
              <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={18} color={selected ? theme.accentBright : theme.muted} />
            </Pressable>;
          })}</View>
        </Panel>
        </>}

        <SectionTitle title="INTERFAZ DEL DISPOSITIVO" caption="El modo celular evita la barra de navegación Android; el modo computador usa menú lateral" icon="phone-portrait-outline" styles={styles} theme={theme} />
        <View style={styles.layoutModeGrid}>{LAYOUT_MODES.map((mode) => {
          const selected = layoutMode === mode.id;
          return <Pressable key={mode.id} accessibilityLabel={`Interfaz ${mode.label}`} onPress={() => changeLayoutMode(mode.id)} style={({ pressed }) => [styles.layoutModeOption, selected && styles.optionSelected, pressed && styles.pressed]}>
            <Ionicons name={mode.icon} size={22} color={selected ? theme.accentBright : theme.muted} />
            <Text style={styles.layoutModeTitle}>{mode.label}</Text><Text style={styles.layoutModeDescription}>{mode.description}</Text>
          </Pressable>;
        })}</View>

        <SectionTitle title="PALETAS" caption={userMode === "technical" ? "Tu paleta normal está guardada y volverá al salir de VoltKey Tec" : "Selecciona una combinación completa; los colores individuales no se modifican"} icon="color-palette-outline" styles={styles} theme={theme} />
        <View style={styles.optionGrid}>{Object.values(PALETTES).map((palette) => {
          const selected = palette.id === paletteId;
          return <Pressable key={palette.id} accessibilityLabel={`Paleta ${palette.name}`} disabled={userMode === "technical"} onPress={() => changePalette(palette.id)} style={({ pressed }) => [styles.paletteOption, selected && styles.optionSelected, userMode === "technical" && styles.paletteOptionDisabled, pressed && styles.pressed]}>
            <View style={styles.paletteSwatches}>{[palette.bg, palette.surfaceRaised, palette.accent, palette.accentBright].map((color, index) => <View key={`${palette.id}-${index}`} style={[styles.swatch, { backgroundColor: color }]} />)}</View>
            <View style={styles.optionTitleRow}><Text style={styles.optionTitle}>{palette.name}</Text>{palette.recommended && <Text style={styles.recommendedBadge}>NUEVOS</Text>}{selected && <Ionicons name="checkmark-circle" size={20} color={theme.accentBright} />}</View>
            <Text style={styles.optionDescription}>{palette.description}</Text>
          </Pressable>;
        })}</View>
        <SectionTitle title="TIPOGRAFÍA" caption="La fuente seleccionada se aplica a toda la aplicación" icon="text-outline" styles={styles} theme={theme} />
        <View style={styles.fontList}>{Object.values(FONT_PRESETS).map((preset) => {
          const selected = preset.id === fontId;
          return <Pressable key={preset.id} accessibilityLabel={`Fuente ${preset.name}`} onPress={() => changeFont(preset.id)} style={({ pressed }) => [styles.fontOption, selected && styles.optionSelected, pressed && styles.pressed]}>
            <View style={{ flex: 1 }}><Text style={[styles.fontSample, { fontFamily: preset.title }]}>{preset.sample}</Text><Text style={styles.optionDescription}>{preset.name}</Text></View>
            <Ionicons name={selected ? "radio-button-on" : "radio-button-off"} size={22} color={selected ? theme.accentBright : theme.muted} />
          </Pressable>;
        })}</View>
        {showInformationModule("system.tariff") && <Panel style={styles.tariffPanel} styles={styles}>
          <SectionTitle title="TARIFARIO EDELAYSEN" caption="Actualización mensual automática · Tarifa residencial BT1" icon="receipt-outline" styles={styles} theme={theme} />
          <View style={styles.tariffHero}>
            <View><Text style={styles.tariffEyebrow}>PRECIO DE REFERENCIA</Text><Text style={styles.tariffValue}>${tariffLabel(tariff)}<Text style={styles.tariffUnit}> /kWh</Text></Text></View>
            <StatusPill icon={tariffMeta.status === "vigente" ? "checkmark-circle-outline" : "time-outline"} label={tariffStatusLabel(tariffMeta.status)} color={tariffMeta.status === "vigente" ? theme.success : theme.warning} styles={styles} />
          </View>
          <View style={styles.separator} />
          <View style={styles.settingsRow}><Text style={styles.settingsLabel}>Empresa y plan</Text><Text style={styles.settingsValue}>{tariffMeta.provider || "Edelaysen"} · {tariffMeta.plan || "BT1"}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Vigente desde</Text><Text style={styles.settingsValue}>{dateLabel(tariffMeta.effectiveFrom)}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Última revisión</Text><Text style={styles.settingsValue}>{tariffMeta.lastCheckedAt ? dateTimeLabel(tariffMeta.lastCheckedAt) : "Pendiente"}</Text></View>
          <Pressable accessibilityLabel="Buscar actualización del tarifario" disabled={tariffRefreshing} onPress={refreshTariff} style={({ pressed }) => [styles.tariffRefreshButton, tariffRefreshing && styles.disabledButton, pressed && styles.pressed]}>
            {tariffRefreshing ? <ActivityIndicator size="small" color={theme.accentBright} /> : <Ionicons name="refresh-outline" size={18} color={theme.accentBright} />}
            <Text style={styles.tariffRefreshText}>{tariffRefreshing ? "REVISANDO TARIFARIO…" : "BUSCAR ACTUALIZACIÓN AHORA"}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Abrir tarifario oficial de Edelaysen" onPress={() => Linking.openURL(tariffMeta.sourceUrl || DEFAULT_TARIFF_META.sourceUrl).catch(() => {})}><Text style={styles.tariffSource}>Fuente: Tarifas vigentes de Edelaysen / Grupo Saesa</Text></Pressable>
        </Panel>}
        <Panel style={styles.syncPanel} styles={styles}>
          <SectionTitle title="SINCRONIZACIÓN EN VIVO" caption={connection === "online" ? "Los cambios se transmiten al celular y computador" : "Conecta el servidor para controlar ambos dispositivos al instante"} icon="sync-outline" styles={styles} theme={theme} />
          <View style={styles.syncRow}>
            <View style={styles.syncDevice}><Ionicons name="phone-portrait-outline" size={22} color={connectedClients.some((client) => client.platform !== "web") ? theme.success : theme.muted} /><Text style={styles.syncDeviceLabel}>Celular</Text><Text style={[styles.syncDeviceState, { color: connectedClients.some((client) => client.platform !== "web") ? theme.success : theme.muted }]}>{connectedClients.some((client) => client.platform !== "web") ? "CONECTADO" : connection === "local" && Platform.OS !== "web" ? "LOCAL" : "EN ESPERA"}</Text></View>
            <View style={styles.syncLine}><View style={[styles.syncPulse, { backgroundColor: connection === "online" ? theme.success : theme.warning }]} /></View>
            <View style={styles.syncDevice}><Ionicons name="desktop-outline" size={22} color={connectedClients.some((client) => client.platform === "web") ? theme.success : theme.muted} /><Text style={styles.syncDeviceLabel}>Computador</Text><Text style={[styles.syncDeviceState, { color: connectedClients.some((client) => client.platform === "web") ? theme.success : theme.muted }]}>{connectedClients.some((client) => client.platform === "web") ? "CONECTADO" : connection === "local" && Platform.OS === "web" ? "LOCAL" : "EN ESPERA"}</Text></View>
          </View>
          <View style={styles.syncFooter}><Text style={styles.syncFooterText}>{connection === "online" ? `${connectedClients.length} dispositivo${connectedClients.length === 1 ? "" : "s"} · ${latency === null ? "Midiendo latencia" : `${latency} ms`}` : "Modo simulación local"}</Text><Text style={styles.syncFooterText}>{lastSyncAt ? `Última sincronización ${dateTimeLabel(lastSyncAt)}` : "Sin sincronización remota"}</Text></View>
        </Panel>
        {showInformationModule("system.hardware") && <><Panel styles={styles}>
          <SectionTitle title="SERVIDOR ARDUINO UNO R3" caption="El UNO conserva tarjeta y circuitos; el computador transporta los datos entre USB e Internet" icon="hardware-chip-outline" styles={styles} theme={theme} />
          <View style={styles.settingsRow}><Text style={styles.settingsLabel}>Estado</Text><StatusPill icon={hardwareBridge.connected ? "checkmark-circle-outline" : "usb-outline"} label={hardwareBridge.connected ? "CONECTADO" : hardwareBridge.enabled ? "BUSCANDO" : "DESACTIVADO"} color={hardwareBridge.connected ? theme.success : theme.warning} styles={styles} /></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Puerto USB</Text><Text style={styles.settingsValue}>{hardwareBridge.port || "Detección automática"}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Firmware</Text><Text style={styles.settingsValue}>{hardwareBridge.firmware || "Esperando Arduino"}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Rol del dispositivo</Text><Text style={styles.settingsValue}>{hardwareBridge.serverRole === "UNO-SERVER-USB" ? "Servidor físico autoritativo" : "Esperando identificación"}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Acceso a Internet</Text><Text style={styles.settingsValue}>Pasarela USB del computador</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Indicador de tarjeta</Text><Text style={[styles.settingsValue, { color: cardLedMode === "steady" ? theme.success : cardLedMode === "off" ? theme.muted : theme.warning }]}>D{cardLedConfig.pin} · {cardLedStatusText}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Salidas disponibles</Text><Text style={styles.settingsValue}>3 relés · prototipo</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Funcionamiento sin Internet</Text><Text style={[styles.settingsValue, { color: hardwareBridge.linkOnline === false ? theme.warning : theme.success }]}>{hardwareBridge.linkOnline === false ? "AUTÓNOMO · USB SIN ENLACE" : "MEMORIA Y REGLAS ACTIVAS"}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Último origen físico</Text><Text style={styles.settingsValue}>{hardwarePrototype.lastEvent?.origin || hardwareBridge.lastCause || "Sin eventos"}</Text></View>
          {!!hardwareBridge.error && <Text style={styles.smartCardSettingsHint}>{hardwareBridge.error}</Text>}
          <View style={styles.anomalySafetyPanel}><Ionicons name="warning-outline" size={22} color={theme.warning} /><Text style={styles.anomalySafetyText}>El indicador de tarjeta usa un pin independiente configurable. Los tres circuitos conservan D12, D11 y D10 de forma predeterminada; todas son señales de 5 V y el UNO R3 no debe conectarse directamente a 220/230 V.</Text></View>
        </Panel>
        {!isChildProfile && <Panel styles={styles}>
          <SectionTitle title="PRUEBA GUIADA DEL HARDWARE" caption="Comprueba enlace, firmware, tarjeta/LED, mapa de relés y memoria EEPROM" icon="checkmark-done-outline" styles={styles} theme={theme} />
          {[['Arduino conectado', hardwareBridge.connected], ['Firmware compatible', hardwareBridge.firmware === APP_VERSION], ['Firmware Arduino Test 1.2', hardwareBridge.testVersion === ARDUINO_TEST_VERSION], ['Tarjeta y LED coherentes', hardwarePrototype.lastSelfTest?.checks?.cardled], ['Mapa de relés válido', hardwarePrototype.lastSelfTest?.checks?.map], ['Memoria EEPROM', hardwarePrototype.lastSelfTest?.checks?.eeprom], ['Pasarela USB', connection === 'online']].map(([label, ok]) => <View key={label} style={styles.diagnosticRow}><Text style={styles.diagnosticLabel}>{label}</Text><Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={21} color={ok ? theme.success : theme.muted} /></View>)}
          <Pressable feedback="confirm" accessibilityLabel="Ejecutar prueba guiada del Arduino" disabled={!hardwareFirmwareReady} onPress={() => sendCommand({ type: "run_hardware_self_test", commandId: `selftest-${Date.now()}` })} style={({ pressed }) => [styles.primaryButton, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="play-outline" size={20} color={theme.onAccent} /><Text style={styles.primaryButtonText}>EJECUTAR PRUEBA COMPLETA</Text></Pressable>
        </Panel>}</>}
        {!isChildProfile && <Panel style={{ borderColor: theme.danger }} styles={styles}>
          <SectionTitle title="PARADA DE EMERGENCIA" caption="Apaga inmediatamente todas las salidas no esenciales; no cambia perfiles ni configuración" icon="alert-circle-outline" styles={styles} theme={theme} />
          <Pressable feedback="alert" accessibilityLabel="Apagar cargas no esenciales" disabled={!hardwareFirmwareReady} onPress={() => Alert.alert("Parada de emergencia", "Se apagarán ahora todas las salidas no esenciales.", [{ text: "Cancelar", style: "cancel" }, { text: "APAGAR", style: "destructive", onPress: () => sendCommand({ type: "emergency_stop", commandId: `emergency-${Date.now()}` }) }])} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.danger }, !hardwareFirmwareReady && styles.disabledButton, pressed && styles.pressed]}><Ionicons name="power" size={20} color="#FFFFFF" /><Text style={[styles.primaryButtonText, { color: "#FFFFFF" }]}>APAGAR NO ESENCIALES</Text></Pressable>
        </Panel>}
        <Panel styles={styles}>
          <SectionTitle title="CONEXIÓN" caption={WS_URL ? "Servidor configurado mediante variable de entorno" : "La aplicación funciona en modo de simulación local"} icon="server-outline" styles={styles} theme={theme} />
          <View style={styles.settingsRow}><Text style={styles.settingsLabel}>Estado</Text><Text style={styles.settingsValue}>{connection.toUpperCase()}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Dispositivos</Text><Text style={styles.settingsValue}>{connection === "online" ? connectedClients.length : 1}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Latencia</Text><Text style={styles.settingsValue}>{latency === null ? "—" : `${latency} ms`}</Text></View>
          <View style={styles.separator} /><View style={styles.settingsRow}><Text style={styles.settingsLabel}>Edición</Text><Text style={styles.settingsValue}>{EDITION_LABEL}</Text></View>
          <Pressable accessibilityLabel="Reconectar con el servidor" onPress={reconnectNow} style={({ pressed }) => [styles.tariffRefreshButton, pressed && styles.pressed]}><Ionicons name="refresh-outline" size={18} color={theme.accentBright} /><Text style={styles.tariffRefreshText}>{connection === "connecting" ? "CONECTANDO…" : "RECONECTAR AHORA"}</Text></Pressable>
        </Panel>
      </ScreenScroller>
    </>
  );

  const screens = { inicio: isChildProfile ? ChildHomeScreen() : userMode === "technical" ? TechnicalScreen() : HomeScreen(), circuitos: CircuitsScreen(), energia: EnergyScreen(), respaldo: BackupScreen(), ajustes: isChildProfile ? ChildSettingsScreen() : SettingsScreen(), tutorial: TutorialScreen() };
  return <View style={[styles.safe, { height: Math.max(320, height), paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <StatusBar barStyle={theme.isLight ? "dark-content" : "light-content"} backgroundColor={theme.bg} />
    <View style={styles.layoutShell}>
      {isDesktopLayout && <AppNavigation active={screen} onChange={setScreen} items={navigationItems} desktop styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} />}
      <View style={styles.appFrame}>{screens[screen] || screens.inicio}</View>
      {!isDesktopLayout && <AppNavigation active={screen} onChange={setScreen} items={navigationItems} desktop={false} styles={styles} theme={theme} technical={userMode === "technical"} kids={isChildProfile} />}
    </View>
    <CircuitFormModal
      visible={circuitModalVisible}
      form={circuitForm}
      editing={Boolean(editingCircuitId)}
      styles={styles}
      theme={theme}
      onChange={updateCircuitForm}
      onClose={closeCircuitModal}
      onSave={saveCircuit}
      onParseText={readCircuitText}
      onPickPhoto={pickCircuitPhoto}
      onOpenLink={openDatasheet}
      onDelete={deleteCircuit}
      onArchive={archiveCircuit}
      onDuplicate={duplicateCircuit}
      fixedCatalog
    />
    <Modal visible={anomalyCenterVisible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setAnomalyCenterVisible(false)}>
      {AnomalyCenterScreen()}
    </Modal>
    <KidsCircuitTimerModal
      action={kidsCircuitAction}
      styles={styles}
      theme={theme}
      onCancel={() => {
        if (kidsCircuitAction) setEventMessage(`${kidsCircuitAction.name}: acción VoltKids cancelada`);
        setKidsCircuitAction(null);
      }}
    />
    <MetricDetailModal
      visible={Boolean(metricModalId)}
      metricId={metricModalId}
      analysis={metricModalId ? analyses[metricModalId] : null}
      records={visibleHistory}
      styles={styles}
      theme={theme}
      periodLabel={periodLabel}
      source={historySource}
      onClose={() => setMetricModalId(null)}
    />
    <AnomalyDetailModal
      anomaly={selectedAnomaly}
      styles={styles}
      theme={theme}
      onClose={() => setSelectedAnomaly(null)}
      onSave={saveAnomalyReview}
    />
    <ScheduleModal
      visible={scheduleModalVisible}
      form={scheduleForm}
      circuits={circuits}
      styles={styles}
      theme={theme}
      connected={connection === "online"}
      onChange={updateScheduleForm}
      onToggleDay={toggleScheduleDay}
      onClose={closeScheduleModal}
      onSave={saveSchedule}
      onDelete={deleteSchedule}
    />
    <ProfileSwitcherModal
      visible={profileSwitcherVisible && userMode !== "technical"}
      profiles={profiles}
      activeProfile={activeProfile}
      pendingRequests={pendingPermissionRequests.length}
      technical={userMode === "technical"}
      styles={styles}
      theme={theme}
      onClose={() => setProfileSwitcherVisible(false)}
      onSelect={selectProfile}
      onManage={openProfileManager}
      onRequestsPress={openPermissionCenter}
    />
    <PermissionRequestsModal
      visible={permissionCenterVisible && userMode !== "technical"}
      requests={permissionRequests}
      profiles={profiles}
      circuits={circuits}
      styles={styles}
      theme={theme}
      onClose={() => setPermissionCenterVisible(false)}
      onResolve={resolvePermissionRequest}
    />
    <NotificationCenterModal visible={notificationCenterVisible} notifications={unifiedNotifications} styles={styles} theme={theme} onClose={() => setNotificationCenterVisible(false)} onOpen={openUnifiedNotification} />
    <ActivityLogModal visible={activityLogVisible} records={activityLog} styles={styles} theme={theme} onClose={() => setActivityLogVisible(false)} />
    <ArchivedCircuitsModal visible={archivedCircuitsVisible && userMode !== "technical"} circuits={archivedCircuits} styles={styles} theme={theme} onClose={() => setArchivedCircuitsVisible(false)} onRestore={restoreArchivedCircuit} onDelete={deleteArchivedCircuit} />
    <BackupRestoreModal visible={backupRestoreVisible && userMode !== "technical"} value={backupRestoreText} styles={styles} theme={theme} onChange={setBackupRestoreText} onClose={() => setBackupRestoreVisible(false)} onRestore={restoreConfigurationBackup} onFill={() => setBackupRestoreText(configurationBackupText())} />
    <MissionIntroModal visible={missionIntroVisible} profileName={activeProfile.name} child={isChildProfile} styles={styles} theme={theme} onStart={startMissionIntroduction} onSkip={skipMissionIntroduction} />
    <TutorialModal visible={tutorialVisible} step={tutorialStep} styles={styles} theme={theme} onNext={() => setTutorialStep((current) => Math.min(TUTORIAL_STEPS.length - 1, current + 1))} onPrevious={() => setTutorialStep((current) => Math.max(0, current - 1))} onClose={closeTutorial} />
    <ProfilePinModal
      visible={Boolean(pinRequest) && userMode !== "technical"}
      profile={profiles.find((profile) => profile.id === pinRequest?.profileId)}
      value={pinRequest?.value || ""}
      error={pinRequest?.error || ""}
      styles={styles}
      theme={theme}
      onChange={(value) => setPinRequest((current) => current ? { ...current, value, error: "" } : current)}
      onClose={() => setPinRequest(null)}
      onConfirm={confirmProfilePin}
    />
    <ProfileFormModal
      visible={profileFormVisible && userMode !== "technical"}
      form={profileForm}
      editing={Boolean(editingProfileId)}
      circuits={circuits}
      styles={styles}
      theme={theme}
      onChange={updateProfileForm}
      onToggleCircuit={toggleProfilePermission}
      onClose={closeProfileForm}
      onSave={saveProfile}
      onDelete={deleteProfile}
    />
    <ModeTransitionOverlay target={modeTransition} normalTheme={normalTheme} font={font} />
    <KidsModeTransitionOverlay transition={kidsThemeTransition} font={font} />
  </View>;
}

export default function App() {
  const [soundsEnabled, setSoundsEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const lastFeedbackRef = useRef({ kind: "", at: 0 });
  const tapPlayer = useAudioPlayer(require("./assets/sounds/tap.wav"));
  const onPlayer = useAudioPlayer(require("./assets/sounds/on.wav"));
  const offPlayer = useAudioPlayer(require("./assets/sounds/off.wav"));
  const confirmPlayer = useAudioPlayer(require("./assets/sounds/confirm.wav"));
  const deletePlayer = useAudioPlayer(require("./assets/sounds/delete.wav"));
  const alertPlayer = useAudioPlayer(require("./assets/sounds/alert.wav"));
  const transitionPlayer = useAudioPlayer(require("./assets/sounds/transition.wav"));

  useEffect(() => {
    AsyncStorage.multiGet(["voltkey.feedbackSoundsEnabled", "voltkey.feedbackHapticsEnabled"]).then((entries) => {
      const values = Object.fromEntries(entries);
      if (values["voltkey.feedbackSoundsEnabled"] === "0") setSoundsEnabled(false);
      if (values["voltkey.feedbackHapticsEnabled"] === "0") setHapticsEnabled(false);
    }).catch(() => {});
  }, []);

  const playUiFeedback = React.useCallback((kind = "tap") => {
    const now = Date.now();
    const previous = lastFeedbackRef.current;
    const minimumGap = kind === "tap" ? 45 : 80;
    if (previous.kind === kind && now - previous.at < minimumGap) return;
    lastFeedbackRef.current = { kind, at: now };
    if (soundsEnabled) {
      const players = { tap: tapPlayer, on: onPlayer, off: offPlayer, confirm: confirmPlayer, delete: deletePlayer, alert: alertPlayer, transition: transitionPlayer };
      const player = players[kind] || tapPlayer;
      Promise.resolve(player.seekTo(0)).then(() => player.play()).catch(() => {});
    }
    if (hapticsEnabled && Platform.OS !== "web") {
      const duration = kind === "tap" ? 5 : ["on", "off", "confirm"].includes(kind) ? 10 : kind === "transition" ? 16 : 22;
      Vibration.vibrate(duration);
    }
  }, [alertPlayer, confirmPlayer, deletePlayer, hapticsEnabled, offPlayer, onPlayer, soundsEnabled, tapPlayer, transitionPlayer]);

  useEffect(() => {
    globalUiFeedback = playUiFeedback;
    return () => {
      if (globalUiFeedback === playUiFeedback) globalUiFeedback = () => {};
    };
  }, [playUiFeedback]);

  const changeSoundsEnabled = (enabled) => {
    setSoundsEnabled(Boolean(enabled));
    AsyncStorage.setItem("voltkey.feedbackSoundsEnabled", enabled ? "1" : "0").catch(() => {});
  };
  const changeHapticsEnabled = (enabled) => {
    setHapticsEnabled(Boolean(enabled));
    AsyncStorage.setItem("voltkey.feedbackHapticsEnabled", enabled ? "1" : "0").catch(() => {});
  };

  return <UiFeedbackContext.Provider value={playUiFeedback}><SafeAreaProvider><AlphaApp soundsEnabled={soundsEnabled} hapticsEnabled={hapticsEnabled} onSoundsEnabledChange={changeSoundsEnabled} onHapticsEnabledChange={changeHapticsEnabled} /></SafeAreaProvider></UiFeedbackContext.Provider>;
}

function createStyles(theme, font, width, height, desktop) {
  const compact = !desktop && width < 380;
  const contentWidth = desktop ? Math.min(Math.max(width - 220, 760), 1180) : Math.min(width, 760);
  const softShadow = theme.shadow || "#000000";
  return StyleSheet.create({
    safe: { flex: 1, minHeight: 0, width: "100%", backgroundColor: theme.bg, overflow: "hidden" },
    layoutShell: { flex: 1, flexBasis: 0, minHeight: 0, height: "100%", width: "100%", maxWidth: desktop ? 1440 : contentWidth, alignSelf: "center", flexDirection: desktop ? "row" : "column", overflow: "hidden" },
    appFrame: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 0, height: "100%", width: desktop ? undefined : "100%", maxWidth: contentWidth, alignSelf: "center", overflow: "hidden" },
    pressed: { opacity: 0.72, transform: [{ scale: 0.985 }] },
    header: { flexShrink: 0, paddingHorizontal: compact ? 13 : 18, paddingTop: Platform.OS === "android" ? 15 : 10, paddingBottom: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface, shadowColor: softShadow, shadowOpacity: theme.isLight ? 0.08 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: theme.isLight ? 3 : 0 },
    headerMainRow: { width: "100%", flexDirection: "row", alignItems: "flex-start", gap: 10 },
    headerIdentity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: compact ? 9 : 12 },
    headerLogo: { width: compact ? 37 : 43, height: compact ? 37 : 43, borderRadius: compact ? 10 : 12, borderWidth: 1, borderColor: `${theme.accent}66` },
    brand: { color: theme.accentBright, fontFamily: font.title, fontSize: compact ? 10 : 11, letterSpacing: 1.4 },
    headerTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 18 : 21, letterSpacing: 0.6, marginTop: 4 },
    headerSubtitle: { color: theme.muted, fontFamily: font.body, fontSize: compact ? 12 : 13, marginTop: 3 },
    headerActions: { flexShrink: 0, alignItems: "flex-end", gap: 6, maxWidth: compact ? 112 : 150 },
    headerProfileButton: { maxWidth: "100%", minHeight: 28, borderRadius: 15, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
    headerProfileText: { maxWidth: compact ? 68 : 98, color: theme.text, fontFamily: font.bold, fontSize: 9 },
    profileAccessRow: { width: "100%", flexDirection: "row", alignItems: "stretch", gap: 7 },
    profileAccessButton: { flex: 1, minHeight: 39, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 8 },
    profileAccessIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    profileAccessEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.8 },
    profileAccessName: { color: theme.text, fontFamily: font.bold, fontSize: 10, marginTop: 2 },
    permissionBell: { width: 43, minHeight: 39, borderRadius: 11, borderWidth: 1, borderColor: `${theme.warning}77`, backgroundColor: `${theme.warning}0D`, alignItems: "center", justifyContent: "center" },
    permissionBellBadge: { position: "absolute", right: 4, top: 3, minWidth: 15, height: 15, borderRadius: 8, backgroundColor: theme.warning, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
    permissionBellBadgeText: { color: theme.bg, fontFamily: font.mono, fontSize: 7 },
    statusPill: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6, marginTop: 2 },
    statusPillText: { fontFamily: font.bold, fontSize: 9, letterSpacing: 0.7 },
    screenViewport: { flex: 1, flexGrow: 1, flexBasis: 0, minHeight: 0, height: 0, position: "relative", overflow: "hidden" },
    screenScroll: { flex: 1, flexGrow: 1, flexBasis: 0, minHeight: 0, height: "100%" },
    webScreenScroll: { overflowY: "auto" },
    content: { paddingLeft: compact ? 13 : 17, paddingRight: desktop ? 61 : compact ? 13 : 17, paddingTop: 19, paddingBottom: desktop ? 70 : 34, gap: 15 },
    desktopScrollControls: { position: "absolute", right: 9, top: 18, bottom: 18, width: 42, zIndex: 20, borderRadius: 21, borderWidth: 1, borderColor: theme.border, backgroundColor: `${theme.surface}F2`, alignItems: "center", justifyContent: "center", paddingVertical: 8, gap: 7, shadowColor: softShadow, shadowOpacity: 0.22, shadowRadius: 8, elevation: 8 },
    desktopScrollButton: { width: 31, height: 31, borderRadius: 16, borderWidth: 1, borderColor: `${theme.accent}88`, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    desktopScrollButtonDisabled: { opacity: 0.28 },
    desktopScrollTrack: { flex: 1, width: 5, minHeight: 62, maxHeight: 150, borderRadius: 4, backgroundColor: theme.border, overflow: "hidden" },
    desktopScrollThumb: { position: "absolute", left: 0, width: "100%", minHeight: 12, borderRadius: 4, backgroundColor: theme.accentBright },
    desktopScrollHint: { color: theme.muted, fontFamily: font.bold, fontSize: 6, letterSpacing: 0.6 },
    panel: { backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: compact ? 14 : 17, overflow: "hidden", shadowColor: softShadow, shadowOpacity: theme.isLight ? 0.075 : 0, shadowRadius: 11, shadowOffset: { width: 0, height: 4 }, elevation: theme.isLight ? 2 : 0 },
    heroPanel: { borderColor: `${theme.accent}88`, borderTopWidth: 3, backgroundColor: theme.surfaceRaised, padding: compact ? 18 : 21, shadowColor: theme.accent, shadowOpacity: theme.isLight ? 0.12 : 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
    heroTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    overline: { color: theme.muted, fontFamily: font.bold, fontSize: 11, letterSpacing: 1.4 },
    heroValue: { color: theme.text, fontFamily: font.mono, fontSize: compact ? 35 : 42, marginTop: 7, letterSpacing: -1.5 },
    heroUnit: { color: theme.accentBright, fontFamily: font.heading, fontSize: compact ? 18 : 21, letterSpacing: 0 },
    pulseWrap: { width: 53, height: 53, alignItems: "center", justifyContent: "center" },
    pulseRing: { position: "absolute", width: 49, height: 49, borderRadius: 25, borderWidth: 1, borderColor: theme.accent, opacity: 0.45 },
    pulseDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: theme.accentBright, shadowColor: theme.accentBright, shadowOpacity: 1, shadowRadius: 8, elevation: 8 },
    heroFooter: { borderTopWidth: 1, borderTopColor: theme.border, marginTop: 15, paddingTop: 11, flexDirection: "row", justifyContent: "space-between" },
    heroFooterText: { color: theme.muted, fontFamily: font.body, fontSize: 12 },
    metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    metricCard: { width: "48.5%", minHeight: 134, padding: 14, borderTopWidth: 3, borderTopColor: `${theme.accent}88` },
    metricIcon: { width: 33, height: 33, borderRadius: 9, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center", marginBottom: 9 },
    metricLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 1 },
    metricValue: { color: theme.text, fontFamily: font.mono, fontSize: compact ? 18 : 21, marginTop: 5 },
    metricUnit: { color: theme.muted, fontFamily: font.body, fontSize: 11 },
    metricOpenRow: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 9 },
    metricOpenText: { color: theme.accentBright, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.8 },
    sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
    sectionTitleWrap: { flex: 1, flexDirection: "row", alignItems: "stretch", gap: 10 },
    sectionMarker: { width: 3, borderRadius: 3, backgroundColor: theme.accent },
    sectionTitle: { color: theme.text, fontFamily: font.heading, fontSize: 15, letterSpacing: 0.65 },
    sectionCaption: { color: theme.muted, fontFamily: font.body, fontSize: 12, marginTop: 3, lineHeight: 16 },
    stateGrid: { flexDirection: "row", alignItems: "stretch", justifyContent: "space-between", paddingTop: 5 },
    stateItem: { flex: 1, alignItems: "center", gap: 4 },
    stateDivider: { width: 1, backgroundColor: theme.border, marginVertical: 3 },
    stateLabel: { color: theme.muted, fontFamily: font.body, fontSize: 11 },
    stateValue: { color: theme.text, fontFamily: font.bold, fontSize: compact ? 11 : 12, letterSpacing: 0.4 },
    alertPanel: { flexDirection: "row", gap: 12, alignItems: "center", borderColor: `${theme.warning}66`, backgroundColor: `${theme.warning}0D` },
    alertTitle: { color: theme.warning, fontFamily: font.heading, fontSize: 13 },
    alertText: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginTop: 2 },
    permissionHomeAlert: { minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D`, padding: 12, flexDirection: "row", alignItems: "center", gap: 11 },
    permissionHomeAlertIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: `${theme.warning}16`, alignItems: "center", justifyContent: "center" },
    permissionHomeAlertBadge: { position: "absolute", top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10, backgroundColor: theme.warning, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
    permissionHomeAlertBadgeText: { color: theme.bg, fontFamily: font.mono, fontSize: 8 },
    permissionHomeAlertTitle: { color: theme.warning, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.5 },
    permissionHomeAlertText: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 3 },
    childWelcomePanel: { minHeight: 116, flexDirection: "row", alignItems: "center", gap: 15, borderWidth: 2, borderColor: `${theme.accent}66`, backgroundColor: theme.surfaceRaised },
    childWelcomeIcon: { width: 64, height: 64, borderRadius: 22, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    childWelcomeTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 17 : 21, letterSpacing: 0.5 },
    childWelcomeText: { color: theme.muted, fontFamily: font.body, fontSize: compact ? 12 : 14, lineHeight: compact ? 17 : 20, marginTop: 5 },
    childEmptyPanel: { minHeight: 176, alignItems: "center", justifyContent: "center", gap: 8, borderStyle: "dashed" },
    childEmptyTitle: { color: theme.text, fontFamily: font.heading, fontSize: 14, letterSpacing: 0.5, marginTop: 5 },
    childEmptyText: { maxWidth: 430, color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, textAlign: "center" },
    childSafetyPanel: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: 12, borderColor: `${theme.success}55` },
    childSafetyTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.5 },
    childSafetyText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 3 },
    childPermissionNotice: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, textAlign: "center", paddingHorizontal: 12 },
    kidsThemeLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8, marginBottom: 9 },
    kidsThemeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    kidsThemeButton: { flex: 1, minWidth: compact ? "47%" : 120, minHeight: 46, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    kidsThemeButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    kidsThemeDot: { width: 9, height: 9, borderRadius: 5 },
    kidsThemeButtonText: { flex: 1, color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.55 },
    hackerMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hackerMetricCard: { width: compact ? "48%" : desktop ? "24%" : "48.5%", minHeight: 104, borderColor: `${theme.accent}77` },
    hackerMetricLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.7, marginTop: 11 },
    hackerMetricValue: { color: theme.accentBright, fontFamily: font.mono, fontSize: compact ? 12 : 14, marginTop: 6 },
    hackerPermissionList: { gap: 9 },
    hackerPermissionCard: { borderLeftWidth: 3, borderLeftColor: theme.accent },
    hackerPermissionTop: { flexDirection: "row", alignItems: "center", gap: 9 },
    hackerPermissionIcon: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    hackerPermissionName: { color: theme.text, fontFamily: font.heading, fontSize: 12 },
    hackerPermissionMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 8, marginTop: 4 },
    hackerPermissionState: { fontFamily: font.bold, fontSize: 7, letterSpacing: 0.7 },
    hackerRequestButton: { minHeight: 42, borderRadius: 10, backgroundColor: theme.accent, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    hackerRequestButtonText: { color: theme.onAccent, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.45 },
    hackerRequestCancel: { minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: `${theme.warning}77`, backgroundColor: `${theme.warning}0D`, marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    hackerRequestCancelText: { color: theme.warning, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.45 },
    hackerLessonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    hackerLessonCard: { width: compact ? "100%" : desktop ? "48.8%" : "100%", minHeight: 145, borderColor: `${theme.accent}66` },
    hackerLessonTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
    hackerLessonCode: { color: theme.accentBright, fontFamily: font.mono, fontSize: 11 },
    hackerLessonTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5, marginTop: 13 },
    hackerLessonText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 6 },
    hackerCircuitRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 7 },
    hackerCircuitName: { color: theme.text, fontFamily: font.bold, fontSize: 11 },
    hackerCircuitMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 7, marginTop: 3 },
    hackerCircuitValue: { color: theme.accentBright, fontFamily: font.mono, fontSize: 10, textAlign: "right" },
    hackerCircuitAmps: { color: theme.muted, fontFamily: font.mono, fontSize: 8, textAlign: "right", marginTop: 3 },
    hackerSafetyPanel: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D` },
    hackerSafetyText: { flex: 1, color: theme.warning, fontFamily: font.body, fontSize: 10, lineHeight: 16 },
    ecoTipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    ecoTipCard: { width: compact ? "100%" : desktop ? "48.8%" : "100%", minHeight: 132, borderColor: `${theme.success}55` },
    ecoTipTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 9 },
    ecoTipIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: `${theme.success}15`, alignItems: "center", justifyContent: "center" },
    ecoMissionCode: { color: theme.success, fontFamily: font.mono, fontSize: 8, letterSpacing: 0.5 },
    ecoTipTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.35, marginTop: 12 },
    ecoTipText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 6 },
    cardControl: { flexDirection: "row", alignItems: "center", gap: 12, borderColor: theme.accent },
    cardControlIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    cardControlTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5 },
    cardControlText: { color: theme.muted, fontFamily: font.body, fontSize: 12, marginTop: 3 },
    cardButton: { width: 38, height: 38, borderRadius: 10, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
    circuitViewHeader: { flexDirection: desktop ? "row" : "column", alignItems: desktop ? "flex-start" : "stretch", gap: 9 },
    compactCardButton: { minWidth: desktop ? 174 : undefined, minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: `${theme.success}77`, backgroundColor: `${theme.success}0D`, paddingHorizontal: 11, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 },
    compactCardButtonWarning: { borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D` },
    compactCardLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.7 },
    compactCardState: { fontFamily: font.bold, fontSize: 9, letterSpacing: 0.35, marginTop: 2 },
    countdownPanel: { flexDirection: "row", alignItems: "center", gap: 11, borderColor: theme.warning, backgroundColor: `${theme.warning}0D` },
    countdownCircle: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: theme.warning, alignItems: "center", justifyContent: "center" },
    countdownValue: { color: theme.warning, fontFamily: font.mono, fontSize: 20 },
    countdownTitle: { color: theme.warning, fontFamily: font.heading, fontSize: 12 },
    countdownText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 2 },
    cancelButton: { borderWidth: 1, borderColor: theme.warning, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 8 },
    cancelButtonText: { color: theme.warning, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.5 },
    addCircuitButton: { minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
    addCircuitIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
    addCircuitTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5 },
    addCircuitText: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 3 },
    anomalyLauncher: { minHeight: 76, borderRadius: 14, borderWidth: 1, borderColor: `${theme.success}55`, backgroundColor: theme.surface, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
    anomalyLauncherPending: { borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}08` },
    anomalyLauncherIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
    anomalyLauncherTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.45 },
    anomalyLauncherText: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    anomalyLauncherBadge: { minWidth: 27, height: 27, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
    anomalyLauncherBadgeText: { color: theme.onAccent, fontFamily: font.mono, fontSize: 10 },
    circuitViewSelector: { flexDirection: desktop ? "row" : "column", gap: 9 },
    circuitViewOption: { flex: 1, minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 11, flexDirection: "row", alignItems: "center", gap: 10 },
    circuitViewOptionActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    circuitViewTitle: { color: theme.text, fontFamily: font.bold, fontSize: 12 },
    circuitViewTitleActive: { color: theme.accentBright },
    circuitViewText: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 14, marginTop: 3 },
    circuitList: { paddingVertical: 2, paddingHorizontal: 14 },
    circuitRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: compact ? 7 : 9, paddingVertical: 10 },
    circuitLocked: { opacity: 0.46 },
    circuitIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    circuitPhoto: { width: "100%", height: "100%" },
    circuitIconActive: { borderColor: `${theme.accent}88`, backgroundColor: theme.accentDim },
    circuitInfo: { flex: 1, minWidth: 0 },
    circuitName: { color: theme.text, fontFamily: font.bold, fontSize: compact ? 13 : 14 },
    circuitMeta: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 3 },
    circuitControlTags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 4 },
    sourceTag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border, paddingHorizontal: 5, paddingVertical: 2 },
    sourceTagText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.5 },
    adminControlTag: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D`, paddingHorizontal: 5, paddingVertical: 2 },
    adminControlTagUnlocked: { borderColor: theme.border, backgroundColor: theme.surfaceRaised },
    adminControlTagText: { color: theme.warning, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.35 },
    essentialButton: { width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    essentialButtonActive: { backgroundColor: theme.accentDim, borderColor: theme.accent },
    editCircuitButton: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    largeCircuitGrid: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: desktop ? 13 : 10 },
    largeCircuitCard: { position: "relative", width: desktop ? "31.8%" : "48.2%", minWidth: desktop ? 205 : 138, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 8, shadowColor: softShadow, shadowOpacity: theme.isLight ? 0.08 : 0.24, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
    largeCircuitButton: { width: "100%", aspectRatio: 1, minHeight: 146, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", padding: compact ? 10 : 13 },
    largeCircuitButtonOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    largeCircuitGraphic: { width: desktop ? 76 : 64, height: desktop ? 76 : 64, borderRadius: desktop ? 22 : 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    largeCircuitGraphicOn: { borderColor: theme.accent, shadowColor: theme.accentBright, shadowOpacity: 0.38, shadowRadius: 10, elevation: 5 },
    largeCircuitPhoto: { width: "100%", height: "100%" },
    largeCircuitName: { color: theme.text, fontFamily: font.heading, fontSize: desktop ? 15 : 13, lineHeight: desktop ? 20 : 17, textAlign: "center", marginTop: 11 },
    largeCircuitPower: { color: theme.muted, fontFamily: font.mono, fontSize: 9, marginTop: 4 },
    largeCircuitState: { width: 7, height: 7, borderRadius: 4, marginTop: 10 },
    largeCircuitStateText: { fontFamily: font.bold, fontSize: 8, letterSpacing: 0.6, marginTop: 3 },
    largeCircuitEdit: { position: "absolute", right: 14, top: 14, zIndex: 4, width: 32, height: 32, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: `${theme.bg}DD`, alignItems: "center", justifyContent: "center" },
    largeCircuitPriority: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, marginTop: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    largeCircuitPriorityOn: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    largeCircuitPriorityText: { color: theme.muted, fontFamily: font.bold, fontSize: compact ? 7 : 8, letterSpacing: 0.5 },
    childPermissionBadge: { minHeight: 44, borderRadius: 11, borderWidth: 1, borderColor: `${theme.success}66`, backgroundColor: `${theme.success}12`, marginTop: 8, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    childPermissionText: { color: theme.success, fontFamily: font.bold, fontSize: compact ? 7 : 8, letterSpacing: 0.6 },
    adminControlBadge: { borderColor: `${theme.warning}77`, backgroundColor: `${theme.warning}0D` },
    adminControlButton: { minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D`, marginTop: 8, paddingHorizontal: 7, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    adminControlButtonUnlocked: { borderColor: theme.border, backgroundColor: theme.surfaceRaised },
    adminControlButtonText: { color: theme.warning, fontFamily: font.bold, fontSize: compact ? 7 : 8, letterSpacing: 0.4 },
    separator: { height: StyleSheet.hairlineWidth, backgroundColor: theme.border },
    chart: { height: 195, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-around", gap: 8, paddingTop: 12 },
    barGroup: { flex: 1, alignItems: "center", height: "100%" },
    barValue: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginBottom: 5 },
    barTrack: { flex: 1, width: compact ? 24 : 31, justifyContent: "flex-end", backgroundColor: theme.surfaceRaised, borderRadius: 5, overflow: "hidden" },
    barFill: { width: "100%", backgroundColor: theme.accent, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
    barLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 11, marginTop: 7 },
    rankingRow: { marginTop: 12 },
    rankingTitleRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7 },
    rankingName: { color: theme.text, fontFamily: font.body, fontSize: 13 },
    rankingValue: { color: theme.muted, fontFamily: font.mono, fontSize: 10 },
    progressTrack: { width: "100%", height: 7, borderRadius: 6, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 6 },
    insightPanel: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderColor: `${theme.accent}77` },
    insightTitle: { color: theme.accentBright, fontFamily: font.heading, fontSize: 12 },
    insightText: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 4 },
    syncPanel: { borderColor: `${theme.accent}88`, backgroundColor: theme.surfaceRaised },
    syncRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
    syncDevice: { flex: 1, minHeight: 72, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", gap: 4, padding: 8 },
    syncDeviceLabel: { color: theme.text, fontFamily: font.bold, fontSize: 11 },
    syncDeviceState: { color: theme.muted, fontFamily: font.body, fontSize: 9, letterSpacing: 0.5 },
    syncLine: { flex: 0.65, height: 2, backgroundColor: theme.border, alignItems: "center", justifyContent: "center" },
    syncPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.accentBright, shadowColor: theme.accentBright, shadowOpacity: 1, shadowRadius: 8, elevation: 5 },
    syncFooter: { marginTop: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, flexDirection: "row", justifyContent: "space-between", gap: 8 },
    syncFooterText: { color: theme.muted, fontFamily: font.mono, fontSize: 9 },
    recommendationRow: { flexDirection: "row", alignItems: "flex-start", gap: 11, paddingVertical: 11 },
    recommendationIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    periodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    periodButton: { flex: 1, minWidth: compact ? "47%" : 68, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
    periodButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    periodButtonText: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.5 },
    periodButtonTextActive: { color: theme.accentBright },
    historyMeta: { marginTop: 11, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, flexDirection: "row", justifyContent: "space-between", gap: 8 },
    historyMetaText: { color: theme.muted, fontFamily: font.mono, fontSize: 9 },
    exportButton: { minHeight: 72, borderRadius: 14, backgroundColor: theme.accent, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 11, shadowColor: theme.accent, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5 },
    disabledButton: { opacity: 0.5 },
    exportTitle: { color: theme.onAccent, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.5 },
    exportText: { color: `${theme.onAccent}DD`, fontFamily: font.body, fontSize: 10, lineHeight: 14, marginTop: 3 },
    scheduleRow: { minHeight: 82, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
    scheduleIcon: { width: 40, height: 40, borderRadius: 11, backgroundColor: theme.surfaceRaised, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    scheduleIconActive: { borderColor: theme.success, backgroundColor: `${theme.success}18` },
    scheduleName: { color: theme.text, fontFamily: font.bold, fontSize: 13 },
    scheduleTime: { color: theme.accentBright, fontFamily: font.mono, fontSize: 12, marginTop: 3 },
    scheduleDays: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    emptyTimer: { alignItems: "center", justifyContent: "center", paddingTop: 10 },
    timerAddButton: { marginTop: 12 },
    batteryPanel: { backgroundColor: theme.surfaceRaised, borderColor: theme.accent },
    batteryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
    batteryValue: { color: theme.text, fontFamily: font.mono, fontSize: 45, marginTop: 7 },
    batteryIconWrap: { width: 65, height: 65, borderRadius: 18, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.surface },
    batteryFooter: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 8 },
    batteryFooterText: { color: theme.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.4 },
    batteryHealthPanel: { borderColor: `${theme.accent}66` },
    batteryHealthHero: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 10 },
    batteryHealthLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8 },
    batteryHealthState: { fontFamily: font.title, fontSize: compact ? 17 : 20, marginTop: 5 },
    batteryHealthPercent: { fontFamily: font.mono, fontSize: compact ? 27 : 32 },
    batteryHealthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
    batteryHealthItem: { flex: 1, minWidth: compact ? "46%" : 120, minHeight: 64, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 9, justifyContent: "center" },
    batteryHealthItemLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.55 },
    batteryHealthItemValue: { color: theme.text, fontFamily: font.mono, fontSize: 12, marginTop: 5 },
    batteryHealthNote: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 12 },
    protectedRow: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 59, paddingVertical: 8 },
    protectedIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    protectedName: { color: theme.text, fontFamily: font.bold, fontSize: 13 },
    protectedMeta: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 2 },
    emptyText: { color: theme.muted, fontFamily: font.body, fontSize: 13, textAlign: "center", paddingVertical: 20 },
    primaryButton: { minHeight: 52, borderRadius: 12, backgroundColor: theme.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 14 },
    primaryButtonWarning: { backgroundColor: theme.warning },
    primaryButtonText: { color: theme.onAccent, fontFamily: font.bold, fontSize: 12, letterSpacing: 0.5, textAlign: "center" },
    disclaimer: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 8 },
    aboutPanel: { minHeight: 146, flexDirection: "row", alignItems: "center", gap: compact ? 14 : 19, borderColor: `${theme.accent}66`, backgroundColor: theme.surfaceRaised },
    aboutLogo: { width: compact ? 88 : 108, height: compact ? 88 : 108, borderRadius: compact ? 21 : 26, borderWidth: 1, borderColor: `${theme.accent}77` },
    aboutContent: { flex: 1, minWidth: 0 },
    aboutEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 1.1 },
    aboutName: { color: theme.text, fontFamily: font.title, fontSize: compact ? 22 : 27, letterSpacing: 0.8, marginTop: 5 },
    aboutVersion: { color: theme.accentBright, fontFamily: font.mono, fontSize: 12, letterSpacing: 0.7, marginTop: 2 },
    aboutText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 7 },
    smartCardSettingsPanel: { borderTopWidth: 3, borderTopColor: theme.accent, backgroundColor: theme.surfaceRaised },
    smartCardSettingsHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
    smartCardSettingsIcon: { width: 54, height: 54, borderRadius: 15, borderWidth: 1, borderColor: `${theme.accent}77`, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    smartCardSettingsEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.9 },
    smartCardSettingsState: { fontFamily: font.title, fontSize: compact ? 14 : 17, marginTop: 4 },
    smartCardSpecGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 15 },
    smartCardSpec: { flex: 1, minWidth: compact ? "46%" : 125, minHeight: 62, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 9, justifyContent: "center" },
    smartCardSpecLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.65 },
    smartCardSpecValue: { color: theme.text, fontFamily: font.bold, fontSize: 11, marginTop: 5 },
    smartCardSettingsButton: { minHeight: 50, borderRadius: 11, backgroundColor: theme.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12, marginTop: 14 },
    smartCardSettingsButtonRestore: { backgroundColor: theme.warning },
    smartCardSettingsButtonText: { color: theme.onAccent, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.45, textAlign: "center" },
    smartCardSettingsHint: { color: theme.warning, fontFamily: font.body, fontSize: 10, textAlign: "center", marginTop: 8 },
    profileManagerList: { paddingVertical: 2, paddingHorizontal: 14 },
    profileManagerRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
    profileManagerIcon: { width: 43, height: 43, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    profileManagerIconActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    profileManagerNameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
    profileManagerName: { color: theme.text, fontFamily: font.bold, fontSize: 14 },
    profileManagerMeta: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 3 },
    profileActiveBadge: { color: theme.success, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.7, borderRadius: 7, borderWidth: 1, borderColor: `${theme.success}66`, backgroundColor: `${theme.success}12`, paddingHorizontal: 6, paddingVertical: 3 },
    profileAddButton: { minHeight: 72, borderRadius: 14, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 },
    profileAddIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
    profileAddTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13, letterSpacing: 0.5 },
    profileAddText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 3 },
    modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 7 },
    modeOption: { flex: 1, minWidth: compact ? "47%" : 220, minHeight: 166, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 14 },
    modeIcon: { width: 43, height: 43, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", marginBottom: 11 },
    modeIconSelected: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    modeTitle: { color: theme.text, fontFamily: font.heading, fontSize: 14, letterSpacing: 0.35 },
    modeDescription: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 5 },
    modeSelectedRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
    modeSelectedText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.7 },
    openTechnicalButton: { minHeight: 62, borderRadius: 12, backgroundColor: theme.accent, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 7 },
    openTechnicalTitle: { color: theme.onAccent, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.45 },
    openTechnicalText: { color: `${theme.onAccent}CC`, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    layoutModeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 7 },
    layoutModeOption: { flex: 1, minWidth: compact ? "47%" : 112, minHeight: 111, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 12, justifyContent: "center" },
    layoutModeTitle: { color: theme.text, fontFamily: font.bold, fontSize: 12, marginTop: 8 },
    layoutModeDescription: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 14, marginTop: 3 },
    optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 7 },
    paletteOption: { width: "48.5%", minHeight: 126, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 12 },
    paletteOptionDisabled: { opacity: 0.55 },
    optionSelected: { borderColor: theme.accent, backgroundColor: theme.surfaceRaised },
    paletteSwatches: { flexDirection: "row", height: 29, borderRadius: 7, overflow: "hidden", marginBottom: 10 },
    swatch: { flex: 1 },
    optionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
    optionTitle: { color: theme.text, fontFamily: font.bold, fontSize: 13, flex: 1 },
    optionDescription: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 4 },
    recommendedBadge: { color: theme.accentBright, backgroundColor: theme.accentDim, borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.5 },
    fontList: { gap: 9, marginBottom: 7 },
    fontOption: { minHeight: 66, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 14, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
    fontSample: { color: theme.text, fontSize: compact ? 14 : 16 },
    settingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
    settingsLabel: { color: theme.muted, fontFamily: font.body, fontSize: 13 },
    settingsValue: { maxWidth: "58%", color: theme.text, fontFamily: font.bold, fontSize: 12, textAlign: "right" },
    tariffPanel: { borderTopWidth: 3, borderTopColor: theme.accent },
    tariffHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingBottom: 14 },
    tariffEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 1 },
    tariffValue: { color: theme.text, fontFamily: font.mono, fontSize: compact ? 25 : 29, marginTop: 5 },
    tariffUnit: { color: theme.accentBright, fontFamily: font.body, fontSize: 12 },
    tariffRefreshButton: { minHeight: 45, marginTop: 12, borderRadius: 11, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 12 },
    tariffRefreshText: { color: theme.accentBright, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.45 },
    tariffSource: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, textAlign: "center", textDecorationLine: "underline", marginTop: 10 },
    profileModalLogo: { width: 42, height: 42, borderRadius: 12 },
    profileActivePanel: { minHeight: 94, flexDirection: "row", alignItems: "center", gap: 13, borderColor: theme.accent, backgroundColor: theme.surfaceRaised },
    profileActiveIcon: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    profileEyebrow: { color: theme.accentBright, fontFamily: font.bold, fontSize: 8, letterSpacing: 1 },
    profileActiveName: { color: theme.text, fontFamily: font.title, fontSize: 20, marginTop: 3 },
    profileActiveDescription: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 3 },
    profileSwitchGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    profileSwitchCard: { width: desktop ? "31.8%" : "48.2%", minWidth: desktop ? 205 : 136, minHeight: 206, borderRadius: 16, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, padding: 14, alignItems: "center" },
    profileSwitchIcon: { width: 67, height: 67, borderRadius: 23, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    profileSwitchIconActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    profileSwitchName: { width: "100%", color: theme.text, fontFamily: font.heading, fontSize: 15, textAlign: "center", marginTop: 11 },
    profileSwitchRole: { color: theme.accentBright, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.9, marginTop: 4 },
    profileSwitchMeta: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 14, textAlign: "center", marginTop: 6 },
    profileSwitchState: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 9 },
    profileSwitchStateText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.5 },
    profileInfoPanel: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.accent}66` },
    profileInfoText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    pinBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 20 },
    pinCard: { width: "100%", maxWidth: 390, borderRadius: 20, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.surface, padding: compact ? 20 : 25, alignItems: "center", shadowColor: theme.accent, shadowOpacity: 0.25, shadowRadius: 22, elevation: 12 },
    pinIcon: { width: 57, height: 57, borderRadius: 19, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    pinTitle: { color: theme.text, fontFamily: font.title, fontSize: 18, textAlign: "center", marginTop: 14 },
    pinDescription: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7 },
    pinInput: { width: "100%", minHeight: 58, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, color: theme.text, fontFamily: font.mono, fontSize: 24, letterSpacing: 13, textAlign: "center", paddingLeft: 13, marginTop: 18 },
    pinInputError: { borderColor: theme.danger },
    pinError: { color: theme.danger, fontFamily: font.bold, fontSize: 10, textAlign: "center", marginTop: 7 },
    pinActions: { width: "100%", flexDirection: "row", gap: 9, marginTop: 17 },
    pinCancel: { flex: 1, minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    pinCancelText: { color: theme.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.5 },
    pinConfirm: { flex: 1, minHeight: 48, borderRadius: 11, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
    profileIconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    profileIconOption: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    profileIconOptionActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    profileRoleGrid: { flexDirection: desktop ? "row" : "column", gap: 9 },
    profileRoleOption: { flex: 1, minHeight: 128, borderRadius: 13, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 14 },
    profileRoleTitle: { color: theme.text, fontFamily: font.heading, fontSize: 14, marginTop: 9 },
    profileRoleText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
    profilePermissionRow: { minHeight: 63, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 5, borderRadius: 10 },
    profilePermissionRowActive: { backgroundColor: `${theme.success}0D` },
    profilePermissionIcon: { width: 39, height: 39, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    profilePermissionIconActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    profilePermissionName: { color: theme.text, fontFamily: font.bold, fontSize: 13 },
    profilePermissionMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 9, marginTop: 3 },
    permissionCenterButton: { minHeight: 58, borderRadius: 12, borderWidth: 1, borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D`, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 9 },
    permissionCenterButtonTitle: { color: theme.warning, fontFamily: font.heading, fontSize: 11 },
    permissionCenterButtonText: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    permissionRequestCount: { minWidth: 61, minHeight: 48, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
    permissionRequestCountValue: { fontFamily: font.mono, fontSize: 16 },
    permissionRequestCountLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 6, letterSpacing: 0.5, marginTop: 2 },
    permissionIntroPanel: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.accent}66` },
    permissionIntroText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    permissionRequestList: { gap: 10 },
    permissionRequestCard: { borderLeftWidth: 3, borderLeftColor: theme.warning },
    permissionRequestTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    permissionRequestIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: `${theme.warning}14`, alignItems: "center", justifyContent: "center" },
    permissionRequestTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13 },
    permissionRequestMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 8, marginTop: 4 },
    permissionRequestPending: { color: theme.warning, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.6 },
    permissionRequestText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, marginTop: 12 },
    permissionRequestActions: { flexDirection: "row", gap: 8, marginTop: 13 },
    permissionDenyButton: { flex: 1, minHeight: 43, borderRadius: 10, borderWidth: 1, borderColor: `${theme.danger}77`, backgroundColor: `${theme.danger}0D`, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    permissionDenyText: { color: theme.danger, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.45 },
    permissionApproveButton: { flex: 1, minHeight: 43, borderRadius: 10, backgroundColor: theme.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
    permissionApproveText: { color: theme.onAccent, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.45 },
    permissionEmptyPanel: { minHeight: 158, alignItems: "center", justifyContent: "center", gap: 7, borderStyle: "dashed" },
    permissionEmptyTitle: { color: theme.text, fontFamily: font.heading, fontSize: 13, textAlign: "center", marginTop: 4 },
    permissionEmptyText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
    permissionHistoryList: { borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, overflow: "hidden" },
    permissionHistoryRow: { minHeight: 61, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border, flexDirection: "row", alignItems: "center", gap: 9 },
    permissionHistoryTitle: { color: theme.text, fontFamily: font.bold, fontSize: 11 },
    permissionHistoryMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 8, marginTop: 3 },
    permissionHistoryStatus: { fontFamily: font.bold, fontSize: 7, letterSpacing: 0.5 },
    kidsTimerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", padding: 22 },
    kidsTimerCard: { width: "100%", maxWidth: 430, borderRadius: 24, borderWidth: 2, borderColor: theme.accent, backgroundColor: theme.surface, padding: compact ? 21 : 27, alignItems: "center", shadowColor: theme.accent, shadowOpacity: 0.35, shadowRadius: 20, elevation: 14 },
    kidsTimerIcon: { width: 69, height: 69, borderRadius: 23, borderWidth: 2, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    kidsTimerEyebrow: { color: theme.accentBright, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.3, marginTop: 18 },
    kidsTimerTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 22 : 26, letterSpacing: 0.7, marginTop: 7 },
    kidsTimerCircuit: { color: theme.muted, fontFamily: font.body, fontSize: 15, textAlign: "center", marginTop: 5 },
    kidsTimerCount: { width: 126, height: 126, borderRadius: 63, borderWidth: 3, alignItems: "center", justifyContent: "center", marginTop: 20 },
    kidsTimerValue: { fontFamily: font.mono, fontSize: 42 },
    kidsTimerUnit: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 1, marginTop: 1 },
    kidsTimerHelp: { maxWidth: 340, color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 18 },
    kidsTimerCancel: { width: "100%", minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18 },
    kidsTimerCancelText: { color: theme.text, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.6 },
    modalSafe: { flex: 1, minHeight: 0, backgroundColor: theme.bg },
    modalHeader: { width: "100%", maxWidth: contentWidth, alignSelf: "center", minHeight: 73, paddingHorizontal: compact ? 13 : 17, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    modalIconButton: { width: 40, height: 40, borderRadius: 11, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center" },
    modalEyebrow: { color: theme.accentBright, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.1 },
    modalTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 16 : 18, marginTop: 3 },
    stepBadge: { borderRadius: 14, backgroundColor: theme.accentDim, borderWidth: 1, borderColor: `${theme.accent}66`, paddingHorizontal: 9, paddingVertical: 5 },
    stepBadgeText: { color: theme.accentBright, fontFamily: font.mono, fontSize: 9 },
    modalContent: { width: "100%", maxWidth: contentWidth, alignSelf: "center", paddingHorizontal: compact ? 13 : 17, paddingTop: 16, paddingBottom: 28, gap: 14 },
    modalFooter: { width: "100%", maxWidth: contentWidth, alignSelf: "center", paddingHorizontal: compact ? 13 : 17, paddingTop: 10, paddingBottom: Platform.OS === "ios" ? 8 : 12, backgroundColor: theme.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    modalSaveButton: { width: "100%" },
    formField: { marginBottom: 12 },
    formLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
    formInput: { minHeight: 45, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, color: theme.text, fontFamily: font.body, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
    formInputMultiline: { minHeight: 112, paddingTop: 11 },
    formRow: { flexDirection: "row", alignItems: "stretch", gap: 10 },
    formHalf: { flex: 1, minWidth: 0 },
    formHint: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 9 },
    chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 13 },
    categoryChip: { minHeight: 34, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", gap: 5 },
    categoryChipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    categoryChipText: { color: theme.muted, fontFamily: font.body, fontSize: 11 },
    categoryChipTextActive: { color: theme.accentBright, fontFamily: font.bold },
    essentialFormRow: { minHeight: 65, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 12 },
    formSwitchTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12 },
    formSwitchHelp: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 15, marginTop: 3 },
    sourceGrid: { flexDirection: "row", gap: 8 },
    sourceOption: { flex: 1, minHeight: 70, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 4 },
    sourceOptionActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    sourceOptionText: { color: theme.muted, fontFamily: font.bold, fontSize: compact ? 9 : 10, textAlign: "center" },
    sourceOptionTextActive: { color: theme.accentBright },
    sourceHelp: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 12 },
    secondaryButton: { minHeight: 44, borderRadius: 10, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    secondaryButtonText: { color: theme.accentBright, fontFamily: font.bold, fontSize: compact ? 9 : 10, letterSpacing: 0.4, textAlign: "center" },
    photoPreview: { width: "100%", height: 190, borderRadius: 11, borderWidth: 1, borderColor: theme.border, marginBottom: 10, backgroundColor: theme.surfaceRaised },
    photoPlaceholder: { width: "100%", height: 145, borderRadius: 11, borderWidth: 1, borderStyle: "dashed", borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 },
    photoPlaceholderText: { color: theme.muted, fontFamily: font.body, fontSize: 12 },
    deleteButton: { minHeight: 48, borderRadius: 11, borderWidth: 1, borderColor: `${theme.danger}88`, backgroundColor: `${theme.danger}0D`, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
    deleteButtonText: { color: theme.danger, fontFamily: font.bold, fontSize: 11, letterSpacing: 0.5 },
    formDisclaimer: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, textAlign: "center", paddingHorizontal: 7 },
    analysisHero: { backgroundColor: theme.surfaceRaised, borderColor: theme.accent },
    analysisStatusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 },
    analysisStatus: { fontFamily: font.title, fontSize: compact ? 18 : 21, marginTop: 5 },
    analysisScore: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, alignItems: "center", justifyContent: "center" },
    analysisScoreValue: { fontFamily: font.mono, fontSize: 17 },
    analysisScoreLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.6, marginTop: 2 },
    analysisSource: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 9 },
    formulaBox: { minHeight: 88, borderRadius: 12, borderWidth: 1, borderColor: `${theme.accent}66`, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center", padding: 13 },
    formulaMain: { color: theme.text, fontFamily: font.mono, fontSize: compact ? 17 : 20, textAlign: "center" },
    formulaSubstitution: { color: theme.accentBright, fontFamily: font.mono, fontSize: 11, textAlign: "center", marginTop: 8 },
    analysisBody: { color: theme.muted, fontFamily: font.body, fontSize: 13, lineHeight: 19, marginTop: 12 },
    conversionRow: { marginTop: 13, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
    conversionLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.7 },
    conversionValue: { flex: 1, color: theme.text, fontFamily: font.mono, fontSize: 11, textAlign: "right" },
    miniChart: { height: 104, flexDirection: "row", alignItems: "flex-end", gap: 3, paddingTop: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    miniChartBar: { flex: 1, minWidth: 2, maxWidth: 14, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    analysisStats: { flexDirection: "row", gap: 6, marginTop: 12 },
    analysisStat: { flex: 1, minHeight: 59, borderRadius: 9, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", padding: 6 },
    analysisStatLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.6 },
    analysisStatValue: { color: theme.text, fontFamily: font.mono, fontSize: compact ? 9 : 10, marginTop: 5, textAlign: "center" },
    anomalyPanel: { borderColor: `${theme.warning}88`, backgroundColor: `${theme.warning}0D` },
    okPanel: { borderColor: `${theme.success}66`, backgroundColor: `${theme.success}0A` },
    anomalyValueRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingTop: 4 },
    anomalyType: { flex: 1, color: theme.warning, fontFamily: font.heading, fontSize: 12 },
    anomalyValue: { color: theme.text, fontFamily: font.mono, fontSize: 12 },
    anomalyOverview: { borderTopWidth: 4, backgroundColor: theme.surfaceRaised },
    anomalyOverviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
    anomalyOverviewStatus: { fontFamily: font.title, fontSize: compact ? 18 : 22, marginTop: 6 },
    anomalyOverviewPeriod: { color: theme.muted, fontFamily: font.body, fontSize: 11, marginTop: 5 },
    anomalyOverviewIcon: { width: 63, height: 63, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    anomalySummaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 17 },
    anomalySummaryCard: { flex: 1, minWidth: compact ? "46%" : 105, minHeight: 66, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", padding: 7 },
    anomalySummaryValue: { fontFamily: font.mono, fontSize: 20 },
    anomalySummaryLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.6, marginTop: 4 },
    anomalyFolderGrid: { flexDirection: desktop ? "row" : "column", gap: 8 },
    anomalyFolderButton: { flex: 1, minHeight: 68, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 10, flexDirection: "row", alignItems: "center", gap: 9 },
    anomalyFolderButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    anomalyFolderIcon: { width: 41, height: 41, borderRadius: 11, alignItems: "center", justifyContent: "center" },
    anomalyFolderTitle: { color: theme.text, fontFamily: font.heading, fontSize: 11, letterSpacing: 0.4 },
    anomalyFolderText: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    anomalyThresholdRow: { flexDirection: compact ? "column" : "row", alignItems: compact ? "stretch" : "flex-end", gap: 10 },
    anomalyThresholdHelp: { color: theme.muted, fontFamily: font.body, fontSize: 9, lineHeight: 14, marginTop: 5 },
    anomalyThresholdSave: { minHeight: 45, borderRadius: 10, backgroundColor: theme.accent, paddingHorizontal: 15, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
    anomalyThresholdSaveText: { color: theme.onAccent, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.55 },
    filterLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.8, marginTop: 15, marginBottom: 7 },
    anomalyFilterGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    anomalyFilterButton: { flexGrow: 1, minWidth: compact ? "46%" : 92, minHeight: 38, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5 },
    anomalyFilterButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    anomalyFilterText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.45 },
    anomalyFilterTextActive: { color: theme.accentBright },
    anomalyList: { gap: 9 },
    anomalyRecord: { minHeight: 112, flexDirection: "row", alignItems: "center", gap: 11, borderLeftWidth: 3, borderLeftColor: theme.warning },
    anomalyRecordResolved: { borderLeftColor: theme.success, opacity: 0.82 },
    anomalyRecordIcon: { width: 47, height: 47, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    anomalyRecordBody: { flex: 1, minWidth: 0 },
    anomalyRecordTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 7 },
    anomalyRecordTitle: { flex: 1, color: theme.text, fontFamily: font.heading, fontSize: 13, lineHeight: 17 },
    anomalyRecordStatus: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.4 },
    anomalyRecordMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 8, marginTop: 4 },
    anomalyRecordDetails: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 14, marginTop: 5 },
    anomalyRecordNote: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
    anomalyRecordNoteText: { flex: 1, color: theme.accentBright, fontFamily: font.body, fontSize: 9 },
    anomalyRecordValueBox: { minWidth: 54, alignItems: "flex-end", gap: 2 },
    anomalyRecordValue: { color: theme.text, fontFamily: font.mono, fontSize: 13 },
    anomalyRecordUnit: { color: theme.muted, fontFamily: font.bold, fontSize: 8 },
    anomalyEmptyPanel: { minHeight: 175, alignItems: "center", justifyContent: "center", gap: 7, borderStyle: "dashed" },
    anomalyEmptyTitle: { color: theme.text, fontFamily: font.heading, fontSize: 14, marginTop: 4 },
    anomalyEmptyText: { maxWidth: 430, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17, textAlign: "center" },
    anomalySafetyPanel: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.accent}66` },
    anomalySafetyText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    anomalyDetailHero: { borderTopWidth: 4, backgroundColor: theme.surfaceRaised },
    anomalyDetailTop: { flexDirection: "row", alignItems: "center", gap: 11 },
    anomalyDetailIcon: { width: 53, height: 53, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    anomalyDetailTitle: { color: theme.text, fontFamily: font.heading, fontSize: 15 },
    anomalyDetailDate: { color: theme.muted, fontFamily: font.mono, fontSize: 9, marginTop: 4 },
    anomalyDetailMetric: { color: theme.muted, fontFamily: font.bold, fontSize: 8, textAlign: "right" },
    anomalyDetailValue: { color: theme.text, fontFamily: font.mono, fontSize: 14, textAlign: "right", marginTop: 4 },
    anomalyDetailDescription: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 13, paddingTop: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
    anomalyStatusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 15 },
    anomalyStatusButton: { flex: 1, minWidth: compact ? "47%" : 100, minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 7 },
    anomalyStatusButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    anomalyStatusButtonText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.4 },
    anomalyStatusButtonTextActive: { color: theme.accentBright },
    anomalyCauseRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8 },
    anomalyCauseNumber: { width: 27, height: 27, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    anomalyCauseNumberText: { color: theme.accentBright, fontFamily: font.mono, fontSize: 10 },
    anomalyCauseText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
    anomalyActionPanel: { borderColor: `${theme.warning}66`, backgroundColor: `${theme.warning}08` },
    anomalyAdviceText: { color: theme.muted, fontFamily: font.body, fontSize: 13, lineHeight: 20 },
    maintenanceRow: { marginTop: 14, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
    maintenanceTitle: { color: theme.accentBright, fontFamily: font.heading, fontSize: 10, letterSpacing: 0.7 },
    maintenanceText: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 17, marginTop: 3 },
    maintenanceTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
    maintenanceInterval: { color: theme.muted, fontFamily: font.mono, fontSize: 8 },
    maintenanceDone: { color: theme.success, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.5, marginTop: 7 },
    technicalBrandPanel: { minHeight: desktop ? 235 : 205, padding: 0, flexDirection: desktop ? "row" : "column", alignItems: "center", justifyContent: "center", borderColor: `${theme.accent}88`, backgroundColor: "#020203" },
    technicalBrandLogo: { width: desktop ? 280 : 230, height: desktop ? 220 : 180 },
    technicalBrandCopy: { flex: desktop ? 1 : undefined, maxWidth: 440, paddingHorizontal: 18, paddingBottom: desktop ? 0 : 18 },
    technicalBrandTitle: { color: "#FFFFFF", fontFamily: font.title, fontSize: desktop ? 20 : 16, letterSpacing: 0.9, textAlign: desktop ? "left" : "center" },
    technicalBrandText: { color: "#B9A0A5", fontFamily: font.body, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: desktop ? "left" : "center" },
    technicalNotice: { flexDirection: "row", alignItems: "flex-start", gap: 12, borderColor: `${theme.warning}66`, backgroundColor: `${theme.warning}0D` },
    goldenRulesPanel: { borderTopWidth: 4, borderTopColor: theme.accent, backgroundColor: theme.surfaceRaised },
    goldenRuleRow: { minHeight: 75, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
    goldenRuleNumber: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    goldenRuleNumberText: { color: theme.accentBright, fontFamily: font.mono, fontSize: 15 },
    goldenRuleTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6 },
    goldenRuleText: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 4 },
    safetyReminder: { marginTop: 14, borderRadius: 11, borderWidth: 1, borderColor: `${theme.warning}77`, backgroundColor: `${theme.warning}0D`, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 9 },
    safetyReminderText: { flex: 1, color: theme.text, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    goldenRulesSource: { minHeight: 43, marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 10 },
    goldenRulesSourceText: { color: theme.accentBright, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.6 },
    exitTechnicalButton: { minHeight: 67, borderRadius: 14, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, paddingHorizontal: 15, paddingVertical: 11, flexDirection: "row", alignItems: "center", gap: 12 },
    exitTechnicalTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, letterSpacing: 0.6 },
    exitTechnicalText: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    diagnosticRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingVertical: 8 },
    diagnosticLabel: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 12 },
    diagnosticValue: { maxWidth: "58%", color: theme.text, fontFamily: font.mono, fontSize: 9, textAlign: "right" },
    technicalActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 13 },
    technicalAction: { flex: 1, minWidth: compact ? "100%" : 180 },
    technicalCircuitRow: { minHeight: 67, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
    prototypeDivider: { height: 1, backgroundColor: theme.border, marginVertical: 18 },
    technicalCircuitBadge: { color: theme.accentBright, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.5, borderRadius: 7, borderWidth: 1, borderColor: `${theme.accent}66`, backgroundColor: theme.accentDim, paddingHorizontal: 7, paddingVertical: 5 },
    circuitPicker: { gap: 8, paddingBottom: 3 },
    circuitPickerItem: { width: 128, minHeight: 92, borderRadius: 11, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 11, justifyContent: "center" },
    circuitPickerItemActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    circuitPickerText: { color: theme.muted, fontFamily: font.bold, fontSize: 11, marginTop: 7 },
    circuitPickerTextActive: { color: theme.text },
    circuitPickerPower: { color: theme.muted, fontFamily: font.mono, fontSize: 9, marginTop: 4 },
    dayGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2, marginBottom: 14 },
    dayButton: { flex: 1, minWidth: 36, height: 38, borderRadius: 9, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    dayButtonActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    dayButtonText: { color: theme.muted, fontFamily: font.bold, fontSize: 10 },
    dayButtonTextActive: { color: theme.accentBright },
    timerExplanation: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.accent}66` },
    timerExplanationText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    desktopNavShell: { flexShrink: 0, minHeight: 0, width: width < 700 ? 84 : 210, backgroundColor: theme.surface, borderRightWidth: 1, borderRightColor: theme.border, paddingHorizontal: width < 700 ? 8 : 13, paddingVertical: 18 },
    desktopNavBrand: { flexDirection: width < 700 ? "column" : "row", alignItems: "center", gap: 10, paddingHorizontal: 5, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    desktopNavLogo: { width: 39, height: 39, borderRadius: 11, backgroundColor: theme.accentDim, borderWidth: 1, borderColor: theme.accent },
    desktopNavLogoText: { color: theme.accentBright, fontFamily: font.title, fontSize: 20 },
    desktopNavEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: width < 700 ? 7 : 8, letterSpacing: 0.8, textAlign: width < 700 ? "center" : "left" },
    desktopNavTitle: { color: theme.text, fontFamily: font.title, fontSize: width < 700 ? 9 : 13, marginTop: 2, textAlign: width < 700 ? "center" : "left" },
    desktopProfileButton: { minHeight: width < 700 ? 70 : 58, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, marginTop: 12, paddingHorizontal: width < 700 ? 5 : 9, paddingVertical: 8, flexDirection: width < 700 ? "column" : "row", alignItems: "center", gap: width < 700 ? 3 : 8 },
    desktopProfileIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    desktopProfileEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.7, textAlign: width < 700 ? "center" : "left" },
    desktopProfileName: { color: theme.text, fontFamily: font.bold, fontSize: width < 700 ? 8 : 11, marginTop: 2, textAlign: width < 700 ? "center" : "left" },
    desktopNavList: { flex: 1, gap: 6, paddingTop: 18 },
    desktopNavButton: { minHeight: 52, borderRadius: 11, flexDirection: width < 700 ? "column" : "row", alignItems: "center", justifyContent: width < 700 ? "center" : "flex-start", gap: width < 700 ? 3 : 11, paddingHorizontal: width < 700 ? 4 : 12 },
    desktopNavButtonActive: { backgroundColor: theme.accentDim, borderWidth: 1, borderColor: `${theme.accent}55` },
    desktopNavLabel: { color: theme.muted, fontFamily: font.body, fontSize: width < 700 ? 8 : 12 },
    desktopNavLabelActive: { color: theme.accentBright, fontFamily: font.bold },
    desktopNavVersion: { color: theme.muted, fontFamily: font.mono, fontSize: 8, textAlign: "center", paddingTop: 12 },
    navShell: { backgroundColor: theme.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingHorizontal: 8, paddingTop: 7, paddingBottom: Platform.OS === "ios" ? 5 : 8, shadowColor: softShadow, shadowOpacity: theme.isLight ? 0.12 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: -3 }, elevation: theme.isLight ? 5 : 0 },
    navScroll: { width: "100%", maxWidth: contentWidth, alignSelf: "center", borderRadius: 16, backgroundColor: theme.surface },
    nav: { minWidth: "100%", flexDirection: "row", backgroundColor: theme.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.border, padding: 4 },
    navButton: { flexGrow: 1, flexBasis: 0, minWidth: compact ? 67 : 72, minHeight: 48, borderRadius: 11, alignItems: "center", justifyContent: "center", gap: 3 },
    navButtonActive: { backgroundColor: theme.accentDim },
    navLabel: { color: theme.muted, fontFamily: font.body, fontSize: compact ? 8 : 9 },
    navLabelActive: { color: theme.accentBright, fontFamily: font.bold },
    headerNotificationButton: { width: 34, height: 30, borderRadius: 10, borderWidth: 1, borderColor: `${theme.warning}77`, backgroundColor: `${theme.warning}12`, alignItems: "center", justifyContent: "center" },
    headerNotificationBadge: { position: "absolute", right: -5, top: -6, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: theme.warning, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
    headerNotificationBadgeText: { color: theme.bg, fontFamily: font.mono, fontSize: 7 },
    filterChip: { minHeight: 36, borderRadius: 18, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 13, alignItems: "center", justifyContent: "center" },
    filterChipActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
    filterChipText: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.45 },
    filterChipTextActive: { color: theme.accentBright },
    activityIntro: { flexDirection: "row", alignItems: "flex-start", gap: 10, borderColor: `${theme.accent}66` },
    activityFilterRow: { gap: 7, paddingBottom: 3 },
    activityList: { gap: 9 },
    activityCard: { flexDirection: "row", alignItems: "flex-start", gap: 11, padding: 13 },
    activityIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center" },
    activityTitleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
    activityTitle: { flex: 1, color: theme.text, fontFamily: font.heading, fontSize: 12 },
    activityOutcome: { fontFamily: font.bold, fontSize: 7, letterSpacing: 0.55 },
    activityMeta: { color: theme.muted, fontFamily: font.mono, fontSize: 8, marginTop: 4 },
    activityDetail: { color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 16, marginTop: 8 },
    notificationCard: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 11, padding: 13 },
    notificationIcon: { width: 45, height: 45, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    notificationCategory: { color: theme.muted, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.8 },
    notificationTitle: { color: theme.text, fontFamily: font.heading, fontSize: 12, marginTop: 3 },
    notificationText: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 15, marginTop: 4 },
    permissionGrantGrid: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 13, marginBottom: 9 },
    permissionGrantButton: { flex: 1, minWidth: compact ? "100%" : 125, minHeight: 93, borderRadius: 11, backgroundColor: theme.accent, padding: 10, alignItems: "center", justifyContent: "center", gap: 4 },
    permissionGrantTitle: { color: theme.onAccent, fontFamily: font.bold, fontSize: 9, letterSpacing: 0.45 },
    permissionGrantText: { color: theme.onAccent, opacity: 0.82, fontFamily: font.body, fontSize: 8, lineHeight: 12, textAlign: "center" },
    circuitEditActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    circuitEditAction: { flex: 1, minWidth: 145 },
    circuitSearchBox: { minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 },
    circuitSearchInput: { flex: 1, color: theme.text, fontFamily: font.body, fontSize: 13, paddingVertical: 10 },
    circuitSearchClear: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
    roomFilterRow: { gap: 7, paddingTop: 10, paddingBottom: 2 },
    circuitDiagnosticTag: { alignSelf: "flex-start", minHeight: 26, marginTop: 6, borderRadius: 8, borderWidth: 1, borderColor: `${theme.warning}66`, backgroundColor: `${theme.warning}0D`, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", gap: 5 },
    circuitDiagnosticTagText: { color: theme.warning, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.45 },
    archiveLauncher: { minHeight: 67, borderRadius: 14, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface, paddingHorizontal: 13, flexDirection: "row", alignItems: "center", gap: 11 },
    archiveLauncherTitle: { color: theme.text, fontFamily: font.heading, fontSize: 11 },
    archiveLauncherText: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    archivedCircuitCard: { gap: 12 },
    archivedCircuitTop: { flexDirection: "row", alignItems: "center", gap: 10 },
    archivedCircuitActions: { flexDirection: "row", gap: 8 },
    ecoProgressPanel: { borderColor: `${theme.success}66` },
    ecoProgressHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginBottom: 10 },
    ecoProgressLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.6 },
    ecoProgressValue: { color: theme.text, fontFamily: font.heading, fontSize: 14, marginTop: 3 },
    ecoProgressSaving: { color: theme.success, fontFamily: font.mono, fontSize: 8, textAlign: "right" },
    ecoBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
    ecoBadge: { flex: 1, minWidth: 100, minHeight: 52, borderRadius: 10, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 7, alignItems: "center", justifyContent: "center", gap: 4, opacity: 0.55 },
    ecoBadgeUnlocked: { borderColor: `${theme.success}77`, backgroundColor: `${theme.success}10`, opacity: 1 },
    ecoBadgeText: { color: theme.muted, fontFamily: font.bold, fontSize: 6, textAlign: "center", letterSpacing: 0.3 },
    ecoTipCardCompleted: { borderColor: `${theme.success}77`, backgroundColor: `${theme.success}08` },
    ecoMissionButton: { minHeight: 37, marginTop: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 8 },
    ecoMissionButtonCompleted: { borderColor: `${theme.success}77`, backgroundColor: `${theme.success}10` },
    ecoMissionButtonText: { color: theme.accentBright, fontFamily: font.bold, fontSize: 7, letterSpacing: 0.45 },
    parentEcoRow: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    parentEcoIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: `${theme.success}12`, alignItems: "center", justifyContent: "center" },
    parentEcoName: { color: theme.text, fontFamily: font.heading, fontSize: 12 },
    parentEcoMeta: { color: theme.muted, fontFamily: font.body, fontSize: 10, marginTop: 3 },
    parentEcoValue: { color: theme.success, fontFamily: font.mono, fontSize: 13 },
    technicalSessionPanel: { borderColor: `${theme.warning}77`, backgroundColor: theme.surfaceRaised },
    technicalSessionStats: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 },
    technicalSessionLabel: { color: theme.muted, fontFamily: font.bold, fontSize: 8, letterSpacing: 0.7 },
    technicalSessionValue: { color: theme.text, fontFamily: font.mono, fontSize: 16, marginTop: 3 },
    feedbackSettingRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
    feedbackSettingIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    feedbackActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    feedbackAction: { flex: 1, minWidth: 145 },
    dataActionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    dataActionButton: { width: compact ? "100%" : "48.5%", minHeight: 104, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, padding: 12, justifyContent: "center" },
    dataActionTitle: { color: theme.text, fontFamily: font.heading, fontSize: 10, marginTop: 8 },
    dataActionText: { color: theme.muted, fontFamily: font.body, fontSize: 9, lineHeight: 14, marginTop: 4 },
    backupTextInput: { minHeight: 280, borderRadius: 12, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceRaised, color: theme.text, fontFamily: font.mono, fontSize: 9, lineHeight: 14, padding: 12, marginBottom: 10 },
    tutorialBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.74)", alignItems: "center", justifyContent: "center", padding: 20 },
    tutorialCard: { width: "100%", maxWidth: 460, borderRadius: 22, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.surface, padding: 22, alignItems: "center" },
    tutorialIcon: { width: 76, height: 76, borderRadius: 24, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center", marginTop: 18 },
    tutorialTitle: { color: theme.text, fontFamily: font.title, fontSize: 20, marginTop: 17, textAlign: "center" },
    tutorialText: { color: theme.muted, fontFamily: font.body, fontSize: 13, lineHeight: 20, marginTop: 9, textAlign: "center" },
    tutorialDots: { flexDirection: "row", gap: 6, marginVertical: 20 },
    tutorialDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.border },
    tutorialDotActive: { width: 20, backgroundColor: theme.accentBright },
    tutorialActions: { width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: 8 },
    tutorialHeroPanel: { minHeight: desktop ? 210 : 245, flexDirection: desktop ? "row" : "column", alignItems: "center", gap: 18, borderWidth: 2, borderColor: `${theme.accent}77`, backgroundColor: theme.surfaceRaised },
    tutorialHeroIcon: { width: 78, height: 78, borderRadius: 25, borderWidth: 1, borderColor: theme.accent, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    tutorialHeroEyebrow: { color: theme.accentBright, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.2, textAlign: desktop ? "left" : "center" },
    tutorialHeroTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 18 : 22, lineHeight: compact ? 23 : 28, marginTop: 7, textAlign: desktop ? "left" : "center" },
    tutorialHeroText: { color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 19, marginTop: 9, textAlign: desktop ? "left" : "center" },
    tutorialReasonGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    tutorialReasonCard: { width: compact ? "100%" : "48.5%", minHeight: 145, justifyContent: "center" },
    tutorialReasonTitle: { color: theme.text, fontFamily: font.heading, fontSize: 11, lineHeight: 15, marginTop: 10 },
    tutorialReasonText: { color: theme.muted, fontFamily: font.body, fontSize: 10, lineHeight: 16, marginTop: 6 },
    tutorialFlowRow: { minHeight: 61, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8 },
    tutorialFlowNumber: { width: 34, height: 34, borderRadius: 11, backgroundColor: theme.accentDim, borderWidth: 1, borderColor: theme.accent, alignItems: "center", justifyContent: "center" },
    tutorialFlowNumberText: { color: theme.accentBright, fontFamily: font.mono, fontSize: 12 },
    tutorialFlowText: { flex: 1, color: theme.text, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
    tutorialWindowRow: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 8 },
    tutorialDemoRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
    tutorialDemoBadge: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.accentDim, alignItems: "center", justifyContent: "center" },
    tutorialDemoBadgeText: { color: theme.accentBright, fontFamily: font.mono, fontSize: 10 },
    tutorialDemoText: { flex: 1, color: theme.muted, fontFamily: font.body, fontSize: 11, lineHeight: 17 },
    childExitPanel: { minHeight: desktop ? 150 : 250, flexDirection: desktop ? "row" : "column", alignItems: "center", gap: 15, borderWidth: 2, borderColor: `${theme.accent}77`, backgroundColor: theme.surfaceRaised },
    childExitButton: { flex: desktop ? 0 : undefined, width: desktop ? 190 : "100%" },
    intro: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center", padding: 24 },
    introContent: { alignItems: "center" },
    introLogoOuter: { position: "absolute", top: -10, width: 136, height: 136, borderRadius: 34, borderWidth: 2, borderColor: theme.accent, shadowColor: theme.accent, shadowOpacity: 0.8, shadowRadius: 25, elevation: 12 },
    introBrandIcon: { width: 122, height: 122, borderRadius: 28, marginBottom: 38, shadowColor: theme.accent, shadowOpacity: 0.45, shadowRadius: 15, elevation: 10 },
    introLogo: { width: 100, height: 100, borderRadius: 26, transform: [{ rotate: "45deg" }], borderWidth: 2, borderColor: theme.accentBright, backgroundColor: theme.surfaceRaised, alignItems: "center", justifyContent: "center", marginBottom: 45 },
    introLogoText: { color: theme.text, fontFamily: font.title, fontSize: 54, transform: [{ rotate: "-45deg" }], textShadowColor: theme.accent, textShadowRadius: 13 },
    introEyebrow: { color: theme.muted, fontFamily: font.bold, fontSize: 10, letterSpacing: 2.1, textAlign: "center", marginBottom: 10 },
    introTitle: { color: theme.text, fontFamily: font.title, fontSize: compact ? 28 : 34, letterSpacing: 1.5, textAlign: "center" },
    introTitleAccent: { color: theme.accentBright, fontFamily: font.title, fontSize: compact ? 28 : 34, letterSpacing: 2, textAlign: "center", marginTop: 4 },
    introRule: { width: 82, height: 2, backgroundColor: theme.accent, marginVertical: 19, shadowColor: theme.accent, shadowOpacity: 1, shadowRadius: 7 },
    introVersion: { color: theme.muted, fontFamily: font.mono, fontSize: 10, letterSpacing: 1 },
    introPurpose: { maxWidth: 440, color: theme.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 13 },
    introFooter: { position: "absolute", bottom: 42, alignItems: "center", gap: 4 },
    introHint: { color: theme.muted, fontFamily: font.bold, fontSize: 9, letterSpacing: 1.5 },
  });
}
