import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as XLSX from "xlsx";
import { detectAnomalies, scheduleDaysLabel } from "./energy";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-CL");
}

function addSheet(workbook, name, rows, widths) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export async function exportEnergyWorkbook({ records, circuits, schedules, anomalies, periodLabel, tariff, source }) {
  const workbook = XLSX.utils.book_new();
  const historyRows = records.map((record) => ({
    "Fecha y hora": formatDate(record.timestamp),
    "Voltaje promedio (V)": Number(record.voltage || 0),
    "Voltaje mínimo (V)": Number(record.voltageMin ?? record.voltage ?? 0),
    "Voltaje máximo (V)": Number(record.voltageMax ?? record.voltage ?? 0),
    "Corriente promedio (A)": Number(record.current || 0),
    "Potencia promedio (W)": Number(record.power || 0),
    "Consumo (kWh)": Number(record.consumption || 0),
    "Costo estimado (CLP)": Number(record.cost || 0),
    "Origen": record.source || source || "desconocido",
  }));
  const totalConsumption = records.reduce((sum, record) => sum + Number(record.consumption || 0), 0);
  const totalCost = records.reduce((sum, record) => sum + Number(record.cost || 0), 0);
  const voltages = records.map((record) => Number(record.voltage || 0)).filter(Boolean);
  const currents = records.map((record) => Number(record.current || 0));
  const summaryRows = [
    { Parámetro: "Periodo exportado", Valor: periodLabel, Unidad: "" },
    { Parámetro: "Origen de datos", Valor: source || "local", Unidad: "" },
    { Parámetro: "Registros", Valor: records.length, Unidad: "filas" },
    { Parámetro: "Voltaje promedio", Valor: voltages.length ? (voltages.reduce((a, b) => a + b, 0) / voltages.length).toFixed(2) : 0, Unidad: "V" },
    { Parámetro: "Voltaje mínimo", Valor: voltages.length ? Math.min(...voltages) : 0, Unidad: "V" },
    { Parámetro: "Voltaje máximo", Valor: voltages.length ? Math.max(...voltages) : 0, Unidad: "V" },
    { Parámetro: "Corriente promedio", Valor: currents.length ? (currents.reduce((a, b) => a + b, 0) / currents.length).toFixed(2) : 0, Unidad: "A" },
    { Parámetro: "Consumo acumulado", Valor: totalConsumption.toFixed(3), Unidad: "kWh" },
    { Parámetro: "Costo estimado", Valor: Math.round(totalCost), Unidad: "CLP" },
    { Parámetro: "Tarifa usada", Valor: tariff, Unidad: "CLP/kWh" },
  ];
  const anomalyRows = (Array.isArray(anomalies) ? anomalies : detectAnomalies(records)).map((anomaly) => ({
    "Fecha y hora": formatDate(anomaly.timestamp),
    Parámetro: anomaly.metric,
    Anomalía: anomaly.type,
    Valor: anomaly.value,
    Unidad: anomaly.unit,
    Severidad: anomaly.severity === "critical" ? "Crítica" : "Advertencia",
    Seguimiento: anomaly.status === "resolved" ? "Resuelta" : anomaly.status === "reviewed" ? "Revisada" : "Pendiente",
    "Nota de revisión": anomaly.note || "",
  }));
  const circuitRows = circuits.map((circuit) => ({
    Circuito: circuit.name,
    "Potencia nominal (W)": Number(circuit.power || 0),
    Estado: circuit.on ? "Encendido" : "Apagado",
    Prioridad: circuit.essential ? "Esencial" : "No esencial",
    Marca: circuit.brand || "",
    Modelo: circuit.model || "",
  }));
  const scheduleRows = schedules.map((schedule) => ({
    Circuito: circuits.find((circuit) => circuit.id === schedule.circuitId)?.name || String(schedule.circuitId),
    Desde: schedule.start,
    Hasta: schedule.end,
    Días: scheduleDaysLabel(schedule.days),
    Estado: schedule.enabled ? "Habilitado" : "Deshabilitado",
  }));

  addSheet(workbook, "Historial", historyRows, [21, 20, 19, 19, 22, 21, 18, 23, 15]);
  addSheet(workbook, "Resumen", summaryRows, [25, 24, 14]);
  addSheet(workbook, "Anomalías", anomalyRows.length ? anomalyRows : [{ Información: "No se detectaron anomalías en el periodo." }], [21, 16, 30, 14, 12, 16, 16, 42]);
  addSheet(workbook, "Circuitos", circuitRows, [25, 21, 14, 18, 18, 18]);
  addSheet(workbook, "Programaciones", scheduleRows.length ? scheduleRows : [{ Información: "No existen temporizadores configurados." }], [25, 12, 12, 28, 18]);

  const date = new Date().toISOString().slice(0, 10);
  const fileName = `VoltKey-Consumo-${periodLabel.replace(/\s+/g, "-")}-${date}.xlsx`;
  if (Platform.OS === "web") {
    XLSX.writeFile(workbook, fileName, { compression: true });
    return { fileName, uri: null, rows: historyRows.length };
  }
  if (!FileSystem.documentDirectory) throw new Error("El almacenamiento de la aplicación no está disponible.");
  const uri = `${FileSystem.documentDirectory}${fileName}`;
  const base64 = XLSX.write(workbook, { type: "base64", bookType: "xlsx", compression: true });
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("El menú para guardar o compartir archivos no está disponible.");
  await Sharing.shareAsync(uri, { mimeType: MIME_XLSX, dialogTitle: "Guardar historial de VoltKey" });
  return { fileName, uri, rows: historyRows.length };
}
