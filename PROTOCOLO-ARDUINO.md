# Protocolo de VoltKey ARDUINO TEST 1.2 (base 1.12.0)

USB serie `115200 8N1`, protocolo ASCII `VK1`, una instrucción por línea.

## Órdenes al UNO

```text
VK1|SET|slot|estado|commandId
VK1|CARDSET|estado|commandId
VK1|GRIDSET|estado|commandId
VK1|POLICY|mascaraEsenciales|demoraSegundos
VK1|RELAYCFG|slot|pin|activoLow
VK1|TESTRELAY|slot|duracionMs|commandId
VK1|CARDLEDCFG|pin|activoLow|intervaloCorteMs
VK1|TESTCARDLED|duracionMs|commandId
VK1|SELFTEST|commandId
VK1|ESTOP|commandId
VK1|PING|marca
VK1|STATE
```

Los slots son `1 General`, `2 Primer piso` y `3 Segundo piso`. Sus pines válidos son D2–D12, sin repeticiones ni conflicto con el indicador de tarjeta. El indicador admite D2–D13 y un intervalo de corte de 200–2000 ms. Durante la cuenta regresiva usa siempre 1000 ms y al finalizar se apaga. D0/D1 están reservados al USB serie. `ESTOP` apaga salidas no esenciales sin modificar configuración.

## Respuestas

```text
VK1|HELLO|1.12.0|3|UNO-SERVER-USB|1.2
VK1|STATE|1:1,2:0,3:0|CARD:1|GRID:1|ESS:1|DELAY:5|SEQ:8|MAP:12,11,10|ALOW:0|RLED:1|CLED:13,0,1000,1,steady|CDOWN:-1|LINK:1|CAUSE:app
VK1|ACK|slot|estadoReal|commandId
VK1|CARDACK|estadoReal|commandId
VK1|GRIDACK|estadoReal|commandId
VK1|CFGACK|1
VK1|TESTACK|slot|commandId
VK1|CARDLEDCFGACK|1
VK1|CARDLEDTESTACK|commandId
VK1|SELFTEST|1|EEPROM:1|MAP:1|CARDLED:1|commandId
VK1|ESTOPACK|commandId
```

`RLED` es una máscara de tres bits que confirma cuáles relés/LED del shield están activos. `CLED` informa pin, polaridad activa LOW, intervalo de corte, salida lógica instantánea y modo: `steady`, `outage_blink`, `countdown_blink` u `off`. `CDOWN` entrega los segundos restantes o `-1` cuando no existe una cuenta regresiva. `CAUSE` identifica el último origen. La pasarela espera confirmación antes de aceptar una orden; si se pierde `CARDACK` o `GRIDACK`, solicita `STATE` y acepta únicamente el estado físico coincidente. El estado del UNO prevalece al reconectar.

Las salidas son lógica de 5 V. No conectes red domiciliaria, bobinas o cargas directamente al Arduino.
