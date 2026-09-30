# Protocolo del medidor — VoltKey Alpha 1.5.0

El servidor central escucha WebSocket en `/ws`. Todas las interfaces reciben el mismo estado y pueden enviar comandos. Si `VOLTKEY_TOKEN` está definido, el cliente debe conectarse a:

```text
wss://servidor.example/ws?token=TOKEN&client_id=medidor-01&platform=hardware&name=Medidor
```

## Telemetría de un medidor externo

Inicia Python con `VOLTKEY_SIMULATION=0` y envía cada 1–5 segundos:

```json
{
  "type": "telemetry_input",
  "source": "medidor-01",
  "voltage": 219.7,
  "current": 4.82,
  "power": 1058.8,
  "energy": 187.43
}
```

`energy` es opcional. El servidor valida rangos básicos, persiste muestras periódicas en SQLite y retransmite la lectura. Si se deja `VOLTKEY_SIMULATION=1`, rechazará `telemetry_input` para evitar mezclar accidentalmente un equipo real con el simulador instantáneo.

## Comandos principales

| Tipo | Campos | Función |
|---|---|---|
| `request_state` | — | Solicita el estado completo. |
| `request_history` | `period`: `1m`, `3m`, `6m`, `1y` | Solicita historial y anomalías. |
| `set_circuit` | `id`, `on` | Enciende o apaga un circuito. |
| `set_essential` | `id`, `essential` | Cambia su prioridad. |
| `set_card` | `inserted`, `delaySeconds` | Simula inserción o retiro de tarjeta. |
| `set_grid` | `available` | Simula red disponible o corte. |
| `set_schedule` | `schedule` | Crea o actualiza un temporizador. |
| `delete_schedule` | `id` | Elimina un temporizador. |
| `telemetry_input` | `voltage`, `current`, `power`, `energy` opcional | Entrega una lectura real. |

Ejemplo de programación:

```json
{
  "type": "set_schedule",
  "source": "computador-web",
  "schedule": {
    "id": "horno-semana",
    "circuitId": 7,
    "start": "12:00",
    "end": "13:15",
    "days": [1, 2, 3, 4, 5],
    "enabled": true
  }
}
```

Los días usan `0 = domingo`, `1 = lunes`, …, `6 = sábado`. Un horario `22:00–06:00` puede cruzar medianoche.

## Mensajes que emite el servidor

- `state` / `state_update`: estado completo y motivo del cambio.
- `telemetry`: voltaje, corriente, potencia, energía, costo y batería.
- `history`: registros agregados, anomalías y origen.
- `presence`: lista de celular, computador y hardware conectados.
- `pong`: respuesta para medir latencia.
- `command_error`: comando rechazado y explicación.

## Integración física segura

El mensaje `set_circuit` expresa una intención lógica. Un controlador físico debe validar enclavamientos, estado real del contactor, corriente máxima, pérdida de comunicación y parada segura antes de accionar. No conectes GPIO directamente a la red domiciliaria.
