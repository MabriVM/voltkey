# Modo de actualización incremental — VoltKey

Esta carpeta **VoltKey Alpha Arduino 2.0.0** es la última entrega completa solicitada.

Desde la próxima actualización:

1. Leer primero la estructura y la versión vigente del proyecto.
2. Identificar exactamente qué archivos requiere la función o corrección.
3. No volver a incluir archivos que no cambien.
4. Antes de reemplazar un archivo, guardar una copia de su versión anterior.
5. La carpeta de respaldo debe contener **solo** los archivos que serán reemplazados, conservando su ruta relativa.
6. La actualización debe incluir un manifiesto con archivos añadidos, modificados y eliminados.
7. No regenerar una carpeta completa salvo que se solicite expresamente.
8. Mantener compatibles los datos persistentes, el protocolo Arduino y la EEPROM salvo que la actualización requiera una migración documentada.

## Base para el siguiente parche

- Aplicación: **VoltKey Alpha Arduino 2.0.0**
- Firmware compatible UNO: **VoltKey Alpha 1.12.0**
- Protocolo físico: **ARDUINO TEST 1.2**
- Tres slots físicos: General, 1er piso y 2do piso
