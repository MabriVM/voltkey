# VoltKey ARDUINO TEST 1.2 — base Alpha 1.12.0

El UNO funciona como servidor físico local. El computador sigue siendo necesario para Internet, Expo, perfiles, historial y tarifas; si se desconecta, el Arduino conserva la tarjeta, los tres relés, General como maestro y la política esencial.

## Mapa predeterminado

| Función | Pin | Comportamiento |
|---|---:|---|
| LED de tarjeta | D13 / LED integrado | Fijo con tarjeta y red; parpadeo por corte/cuenta regresiva; apagado al finalizar |
| Contacto de tarjeta | A0 | LOW presente, HIGH ausente |
| General | D12 | Maestro, esencial y LED de canal 1 |
| Primer piso | D11 | Depende de General y LED de canal 2 |
| Segundo piso | D10 | Depende de General y LED de canal 3 |

Puedes cambiar D12/D11/D10 desde **Circuitos → Prototipo Arduino**. Se aceptan D2–D12, sin repetir ni ocupar el pin del indicador de tarjeta. También puedes elegir módulos de relé activos en LOW. En cada canal, `ON` en la aplicación debe energizar el relé y encender el LED incorporado en el shield; usa **Pulso físico** para comprobarlo.

El indicador de tarjeta también se configura en ese panel: admite D2–D13, polaridad activa HIGH/LOW, pulso de prueba y un intervalo de 0,25, 0,5, 1 o 2 segundos para el parpadeo durante un corte. Con tarjeta y red queda fijo; al retirar la tarjeta parpadea cada 1 segundo mientras corre la demora y se apaga al terminar. Los cambios quedan guardados en la EEPROM del UNO.

El software solo decide qué pin usa como salida. Si el shield tiene sus canales unidos a pines fijos por sus pistas, debes elegir esos mismos pines en VoltKey; la aplicación no puede cambiar el cableado interno del shield.

## Preparación

1. Conecta el UNO con un cable USB de datos.
2. Ejecuta `Actualizar-Arduino.cmd`.
3. Cierra Arduino IDE y el Monitor Serie si estaban abiertos.
4. Ejecuta `Probar-Arduino.cmd`.
5. Inicia la aplicación con `Iniciar-VoltKey.cmd`.

Si el actualizador no encuentra Arduino CLI, instala Arduino IDE 2 o abre `arduino\VoltKey_Uno_R3\VoltKey_Uno_R3.ino`, selecciona Arduino Uno y pulsa **Subir**.

## Contacto de tarjeta

La edición comienza con la tarjeta habilitada, el LED indicador encendido, General encendido y los pisos apagados. Para probar el contacto físico, conecta un pulsador o interruptor entre `A0` y `GND`: cerrado significa tarjeta presente; al abrirlo, la tarjeta pasa a ausente, el LED parpadea durante la cuenta regresiva y se apaga al finalizar. No requiere resistencia externa porque el firmware usa `INPUT_PULLUP`.

## Tutorial y acceso desde VoltKids

La sexta pestaña **Tutorial** explica por qué existe VoltKey, cómo viaja una orden hasta el UNO y cómo hacer una demostración. En **Ajustes → Mostrar sexta ventana** puedes ocultarla para volver a las cinco ventanas principales o restaurarla después.

VoltKids tiene su propio acceso seguro a **Ajustes**. Allí puede cambiar sonido, abrir el Tutorial o solicitar el regreso al administrador mediante PIN; la configuración de circuitos, pines y hardware continúa protegida. ARDUINO TEST 1.2 corrige el retorno automático a Inicio: VoltKids permanece en Ajustes o Tutorial durante sincronizaciones y cambios del Arduino.

## Prueba y emergencia

En Circuitos puedes controlar y probar cada relé/LED con un pulso breve. En Ajustes puedes ejecutar una comprobación de firmware/EEPROM y usar la parada de emergencia. La parada apaga solamente salidas no esenciales y no elimina perfiles, permisos ni configuración.

## Seguridad

El Arduino UNO R3 trabaja con 5 V y corriente pequeña. No conectes 220/230 V, enchufes, contactores ni bobinas directamente. Una instalación real necesita aislamiento, fuente protegida, etapa de potencia certificada, envolvente y revisión de personal eléctrico autorizado.

Durante un corte real, el LED solo puede parpadear si el UNO continúa alimentado por USB desde un computador, UPS o fuente de respaldo de 5 V. El botón de la aplicación permite simular el corte sin retirar la alimentación del Arduino.
