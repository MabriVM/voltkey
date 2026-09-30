// Respaldo redondeado para BT1 residencial de Edelaysen. El servidor intenta
// reemplazarlo mensualmente con el pliego oficial vigente.
export const TARIFF_CLP = 280;

export const PERIOD_OPTIONS = [
  { id: "1m", label: "1 mes", days: 30 },
  { id: "3m", label: "3 meses", days: 90 },
  { id: "6m", label: "6 meses", days: 180 },
  { id: "1y", label: "1 año", days: 365 },
];

export const DAY_OPTIONS = [
  { id: 1, label: "L", long: "Lunes" },
  { id: 2, label: "M", long: "Martes" },
  { id: 3, label: "X", long: "Miércoles" },
  { id: 4, label: "J", long: "Jueves" },
  { id: 5, label: "V", long: "Viernes" },
  { id: 6, label: "S", long: "Sábado" },
  { id: 0, label: "D", long: "Domingo" },
];

export const METRIC_DEFINITIONS = {
  voltage: {
    id: "voltage",
    title: "VOLTAJE",
    unit: "V",
    icon: "speedometer-outline",
    formula: "V = I × R",
    formulaName: "Ley de Ohm",
    explanation: "El voltaje es la diferencia de potencial que impulsa la corriente por el circuito.",
    solution: "Revisa el origen de alimentación, apriete de conexiones, sección de conductores y distribución de cargas. Si la variación persiste, solicita medición con instrumento calibrado y revisión de un instalador autorizado.",
    maintenance: "Inspección de bornes, protecciones, empalme y registro del voltaje bajo carga.",
  },
  current: {
    id: "current",
    title: "CORRIENTE",
    unit: "A",
    icon: "pulse-outline",
    formula: "I = P ÷ V",
    formulaName: "Corriente estimada",
    explanation: "La corriente representa el flujo eléctrico demandado por las cargas activas.",
    solution: "Identifica qué circuito produce el aumento, desconecta cargas innecesarias y verifica que conductores y protecciones estén dimensionados para esa corriente.",
    maintenance: "Medición con pinza amperimétrica y revisión de calentamiento, protecciones y conexiones.",
  },
  consumption: {
    id: "consumption",
    title: "CONSUMO",
    unit: "kWh",
    icon: "flash-outline",
    formula: "E = P(kW) × t(h)",
    formulaName: "Energía consumida",
    explanation: "El consumo suma la energía utilizada por las cargas durante un periodo.",
    solution: "Reduce horas de uso, programa cargas de alta potencia, elimina consumos en espera y compara periodos equivalentes antes de intervenir.",
    maintenance: "Contraste con el medidor principal, revisión de cargas permanentes y búsqueda de consumos fuera de horario.",
  },
  cost: {
    id: "cost",
    title: "COSTO ESTIMADO",
    unit: "CLP",
    icon: "cash-outline",
    formula: "Costo = kWh × tarifa",
    formulaName: "Estimación económica",
    explanation: "El costo se calcula con la energía registrada y una tarifa configurable de referencia.",
    solution: "Comprueba la tarifa de tu boleta, desplaza consumos programables y prioriza la reducción de las cargas con mayor potencia y tiempo de uso.",
    maintenance: "Actualizar tarifa y comparar la estimación con la facturación real cada mes.",
  },
};

export const ANOMALY_METRIC_OPTIONS = [
  { id: "all", label: "Todas", icon: "warning-outline" },
  { id: "voltage", label: "Voltaje", icon: "speedometer-outline" },
  { id: "current", label: "Corriente", icon: "pulse-outline" },
  { id: "consumption", label: "Consumo", icon: "flash-outline" },
];

export const ANOMALY_STATUS_OPTIONS = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Pendientes" },
  { id: "reviewed", label: "Revisadas" },
  { id: "resolved", label: "Resueltas" },
];

const ANOMALY_GUIDANCE = {
  voltage_low: {
    title: "Variación baja de tensión",
    causes: [
      "Demanda elevada simultánea dentro de la vivienda.",
      "Conexión floja, conductor subdimensionado o caída excesiva en el alimentador.",
      "Problema en el empalme o en la red de distribución.",
    ],
    immediate: "Apaga cargas no esenciales de alta potencia y comprueba si el voltaje vuelve al rango habitual. No manipules el tablero energizado.",
    support: "Registra tensión sin carga y bajo carga. Si se repite, solicita revisión de conexiones y alimentadores a un instalador autorizado; si afecta a vecinos, informa a la distribuidora.",
  },
  voltage_high: {
    title: "Variación alta de tensión",
    causes: [
      "Regulación anormal de la red o variación del suministro.",
      "Problema de neutro o conexión defectuosa.",
      "Lectura incorrecta del sensor o configuración nominal equivocada.",
    ],
    immediate: "Desconecta equipos electrónicos sensibles si la sobretensión persiste y evita intervenir en conductores o protecciones energizadas.",
    support: "Contrasta con un instrumento calibrado. Si el valor se confirma, solicita atención de un instalador autorizado y de la empresa distribuidora.",
  },
  current_peak: {
    title: "Aumento anormal de corriente",
    causes: [
      "Arranque de motor, bomba, compresor o climatización.",
      "Sobrecarga por varias cargas conectadas al mismo circuito.",
      "Equipo defectuoso, atasco mecánico o conexión deteriorada.",
    ],
    immediate: "Identifica qué equipo se activó en ese momento y desconecta la carga si existe olor, ruido, calentamiento o disparo de protección.",
    support: "Mide con pinza amperimétrica y revisa el dimensionamiento del circuito, protección y equipo con personal autorizado.",
  },
  consumption_high: {
    title: "Demanda o consumo elevado",
    causes: [
      "Uso simultáneo de horno, calefacción, bomba o aire acondicionado.",
      "Temporizador demasiado extenso o carga funcionando fuera de horario.",
      "Consumo en espera, equipo ineficiente o falla de control.",
    ],
    immediate: "Revisa las cargas de mayor potencia y posterga las que no sean esenciales. Comprueba los temporizadores activos.",
    support: "Compara días equivalentes, revisa horas de funcionamiento y contrasta el registro con el medidor o la boleta.",
  },
  generic: {
    title: "Evento eléctrico para revisión",
    causes: [
      "Cambio fuera del comportamiento habitual registrado por VoltKey.",
      "Lectura incompleta, sensor descalibrado o pérdida momentánea de comunicación.",
      "Condición real del circuito que requiere una medición de comprobación.",
    ],
    immediate: "Observa si el evento se repite y evita intervenir en partes energizadas.",
    support: "Conserva la fecha, hora y valor; contrasta con instrumentos adecuados y solicita soporte técnico si persiste.",
  },
};

export function anomalyRecordKey(anomaly) {
  return `${String(anomaly?.timestamp || "sin-fecha")}|${String(anomaly?.metric || "unknown")}|${String(anomaly?.type || "Evento")}`;
}

export function getAnomalyGuidance(anomaly) {
  const type = String(anomaly?.type || "").toLowerCase();
  if (type.includes("caída") || type.includes("bajo voltaje")) return ANOMALY_GUIDANCE.voltage_low;
  if (type.includes("sobretensión") || type.includes("alto voltaje")) return ANOMALY_GUIDANCE.voltage_high;
  if (type.includes("corriente") || type.includes("sobrecorriente")) return ANOMALY_GUIDANCE.current_peak;
  if (type.includes("consumo") || type.includes("demanda")) return ANOMALY_GUIDANCE.consumption_high;
  if (anomaly?.metric === "voltage") return ANOMALY_GUIDANCE.voltage_low;
  if (anomaly?.metric === "current") return ANOMALY_GUIDANCE.current_peak;
  if (anomaly?.metric === "consumption") return ANOMALY_GUIDANCE.consumption_high;
  return ANOMALY_GUIDANCE.generic;
}

const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));

export function buildDemoHistory(days = 365, tariff = TARIFF_CLP) {
  const result = [];
  const now = new Date();
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - index);
    const seasonal = Math.sin((days - index) / 24) * 1.15;
    const weekly = [0, 6].includes(date.getDay()) ? 0.85 : 0;
    const consumption = Math.max(2.1, 5.4 + seasonal + weekly + Math.sin(index * 1.73) * 0.38);
    const voltage = index % 97 === 0 ? 193 : 220 + Math.sin(index * 0.71) * 4.2;
    const averagePower = consumption / 8 * 1000;
    const current = averagePower / Math.max(voltage, 1);
    result.push({
      timestamp: date.toISOString(),
      voltage: round(voltage, 1),
      voltageMin: round(voltage - 2.4, 1),
      voltageMax: round(voltage + 2.1, 1),
      current: round(current, 2),
      power: round(averagePower, 0),
      consumption: round(consumption, 3),
      cost: Math.round(consumption * tariff),
      source: "simulation",
    });
  }
  return result;
}

export function filterHistory(records, periodId) {
  const days = PERIOD_OPTIONS.find((period) => period.id === periodId)?.days || 30;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return (records || []).filter((record) => new Date(record.timestamp).getTime() >= since);
}

function metricValue(metricId, record) {
  if (metricId === "voltage") return Number(record.voltage || 0);
  if (metricId === "current") return Number(record.current || 0);
  if (metricId === "consumption") return Number(record.consumption || 0);
  return Number(record.cost || 0);
}

export function detectAnomalies(records, powerThreshold = 3500) {
  const source = records || [];
  if (!source.length) return [];
  const avgCurrent = source.reduce((sum, item) => sum + Number(item.current || 0), 0) / source.length;
  const avgConsumption = source.reduce((sum, item) => sum + Number(item.consumption || 0), 0) / source.length;
  const anomalies = [];
  source.forEach((record) => {
    const voltage = Number(record.voltage || 0);
    const current = Number(record.current || 0);
    const power = Number(record.power || 0);
    const consumption = Number(record.consumption || 0);
    if (voltage > 0 && voltage < 198) anomalies.push({ timestamp: record.timestamp, metric: "voltage", type: "Caída de voltaje", value: voltage, unit: "V", severity: voltage < 187 ? "critical" : "warning" });
    else if (voltage > 242) anomalies.push({ timestamp: record.timestamp, metric: "voltage", type: "Sobretensión", value: voltage, unit: "V", severity: voltage > 253 ? "critical" : "warning" });
    if (avgCurrent > 0 && current > avgCurrent * 1.7) anomalies.push({ timestamp: record.timestamp, metric: "current", type: "Punta de corriente", value: current, unit: "A", severity: "warning" });
    if (Number.isFinite(Number(powerThreshold)) && Number(powerThreshold) > 0 && power >= Number(powerThreshold)) anomalies.push({ timestamp: record.timestamp, metric: "consumption", type: "Demanda elevada", value: power, unit: "W", severity: power >= Number(powerThreshold) * 1.25 ? "critical" : "warning", details: `La potencia superó el límite configurado de ${Number(powerThreshold).toLocaleString("es-CL")} W.` });
    if (avgConsumption > 0 && consumption > avgConsumption * 1.55) anomalies.push({ timestamp: record.timestamp, metric: "consumption", type: "Consumo inusualmente alto", value: consumption, unit: "kWh", severity: "warning" });
  });
  return anomalies.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function getMetricAnalysis(metricId, records, liveValues = {}, powerThreshold = 3500) {
  const definition = METRIC_DEFINITIONS[metricId];
  const values = (records || []).map((record) => metricValue(metricId, record)).filter((value) => Number.isFinite(value));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const anomalies = detectAnomalies(records, powerThreshold).filter((anomaly) => {
    if (metricId === "cost") return anomaly.metric === "consumption";
    return anomaly.metric === metricId;
  });
  let healthy = values.length;
  if (metricId === "voltage") healthy = values.filter((value) => value >= 198 && value <= 242).length;
  else if (values.length && average > 0) healthy = values.filter((value) => value <= average * 1.55).length;
  const score = values.length ? Math.max(0, Math.round(healthy / values.length * 100)) : 100;
  const status = score >= 96 ? "Estable" : score >= 85 ? "Mayormente estable" : score >= 65 ? "Poco estable" : "Inestable";
  const power = Number(liveValues.power || 0);
  const voltage = Number(liveValues.voltage || 220);
  const current = Number(liveValues.current || (power / Math.max(voltage, 1)));
  const consumption = Number(liveValues.consumption || 0);
  const cost = Number(liveValues.cost || 0);
  const tariff = Number(liveValues.tariff || TARIFF_CLP);
  const conversion = metricId === "voltage"
    ? `${round(voltage / 1000, 3)} kV · ${Math.round(voltage * 1000).toLocaleString("es-CL")} mV`
    : metricId === "current"
      ? `${Math.round(current * 1000).toLocaleString("es-CL")} mA · ${round(current, 2)} A`
      : metricId === "consumption"
        ? `${Math.round(consumption * 1000).toLocaleString("es-CL")} Wh · ${round(consumption, 2)} kWh`
        : `$${Math.round(cost).toLocaleString("es-CL")} CLP al periodo`;
  const substitution = metricId === "voltage"
    ? `${round(voltage, 1)} V = ${round(current, 2)} A × ${round(voltage / Math.max(current, 0.01), 1)} Ω`
    : metricId === "current"
      ? `${round(current, 2)} A = ${Math.round(power)} W ÷ ${round(voltage, 1)} V`
      : metricId === "consumption"
        ? `${round(consumption, 2)} kWh registrados en el periodo seleccionado`
        : `$${Math.round(cost).toLocaleString("es-CL")} = ${round(consumption, 2)} kWh × $${tariff.toLocaleString("es-CL")}/kWh`;
  return { definition, average, min, max, anomalies, lastAnomaly: anomalies[0] || null, score, status, conversion, substitution };
}

export function getRecommendations(circuits, schedules, history, livePower, batteryCapacityKwh = 1.5, powerThreshold = 3500) {
  const ranked = [...(circuits || [])].sort((a, b) => Number(b.power || 0) - Number(a.power || 0));
  const recommendations = [];
  const highest = ranked[0];
  if (highest) recommendations.push({ icon: "flash-outline", title: "Carga de mayor potencia", text: `${highest.name} es la carga nominal más potente con ${Number(highest.power || 0).toLocaleString("es-CL")} W. Evita hacerla coincidir con otras cargas intensivas.` });
  const highWithoutTimer = ranked.find((circuit) => Number(circuit.power || 0) >= 750 && !(schedules || []).some((schedule) => schedule.circuitId === circuit.id && schedule.enabled));
  if (highWithoutTimer) recommendations.push({ icon: "time-outline", title: "Programación recomendada", text: `${highWithoutTimer.name} no tiene horario. Configura un temporizador para limitar su tiempo de funcionamiento.` });
  const activeHeavy = ranked.filter((circuit) => circuit.on && Number(circuit.power || 0) >= 750);
  if (activeHeavy.length >= 2) recommendations.push({ icon: "warning-outline", title: "Evita puntas simultáneas", text: `${activeHeavy.slice(0, 2).map((circuit) => circuit.name).join(" y ")} están activas. Escalona sus horarios para reducir la demanda máxima.` });
  const essentialPower = (circuits || []).reduce((sum, circuit) => sum + (circuit.essential ? Number(circuit.power || 0) : 0), 0);
  if (essentialPower > batteryCapacityKwh * 1000) recommendations.push({ icon: "battery-half-outline", title: "Respaldo exigido", text: `Los circuitos esenciales suman ${essentialPower.toLocaleString("es-CL")} W. Revisa la autonomía disponible y deja solo internet, seguridad y cargas realmente críticas.` });
  const recent = filterHistory(history, "1m");
  const consumption = recent.reduce((sum, item) => sum + Number(item.consumption || 0), 0);
  if (consumption > 180) recommendations.push({ icon: "trending-down-outline", title: "Consumo mensual elevado", text: `El periodo acumula aproximadamente ${round(consumption, 1)} kWh. Reduce horas de climatización, horno y cargas en espera.` });
  if (livePower >= powerThreshold) recommendations.push({ icon: "speedometer-outline", title: "Demanda instantánea alta", text: `La potencia actual es ${Math.round(livePower).toLocaleString("es-CL")} W y superó tu límite de ${Number(powerThreshold).toLocaleString("es-CL")} W. Apaga o posterga una carga no esencial.` });
  if (!recommendations.length) recommendations.push({ icon: "checkmark-circle-outline", title: "Uso eficiente", text: "No se detectan recomendaciones críticas. Mantén horarios y revisa el historial cada semana." });
  return recommendations.slice(0, 5);
}

function timeToMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function isValidTime(value) {
  return timeToMinutes(value) !== null;
}

export function isScheduleActive(schedule, date = new Date()) {
  if (!schedule?.enabled || !schedule.days?.length) return false;
  const start = timeToMinutes(schedule.start);
  const end = timeToMinutes(schedule.end);
  if (start === null || end === null || start === end) return false;
  const current = date.getHours() * 60 + date.getMinutes();
  const day = date.getDay();
  if (start < end) return schedule.days.includes(day) && current >= start && current < end;
  const previousDay = (day + 6) % 7;
  return (schedule.days.includes(day) && current >= start) || (schedule.days.includes(previousDay) && current < end);
}

export function scheduleDaysLabel(days) {
  const ordered = DAY_OPTIONS.filter((day) => (days || []).includes(day.id));
  if (ordered.length === 7) return "Todos los días";
  if (ordered.length === 5 && [1, 2, 3, 4, 5].every((day) => days.includes(day))) return "Lunes a viernes";
  return ordered.map((day) => day.label).join(" · ") || "Sin días";
}
