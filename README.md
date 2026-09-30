# VoltKey Alpha Arduino 2.1.0

**Paquete completo independiente.** Esta carpeta ya incorpora los cambios de VoltKey Alpha Arduino 2.1.0 sobre la rama 2.x.x; no es necesario instalar primero 2.0.0 ni aplicar el parche incremental.

## Novedades de VoltKey Alpha Arduino 2.1.0

- Introducción guiada basada en misiones y logros para perfiles Administrador y VoltKids.
- Progresión de información **Perfil 3 (Mínimo) → Perfil 2 (Esencial) → Perfil 1 (Completo)**.
- Al completar la ruta de Administrador se habilita la ruta de misiones **VoltKey Tec**.
- El tutorial puede omitirse y reiniciarse desde Ajustes.
- Nueva configuración de **Información visible** por perfil, con presets Completo, Esencial y Mínimo y bloques editables.
- La interfaz muestra únicamente la versión **VoltKey Alpha Arduino 2.1.0**, sin presentar una etiqueta de "Base Alpha 1.12.0" al usuario.

---

## Documentación heredada de la rama 2.0.0

# VoltKey Alpha Arduino 2.0.0

Versión de aplicación: **VoltKey Alpha Arduino 2.0.0**. Mantiene compatibilidad física con **ARDUINO TEST 1.2** y con el firmware base **VoltKey Alpha 1.12.0** del UNO R3; el protocolo físico no se renombra para evitar romper la pasarela USB, la EEPROM ni las pruebas existentes.

## Novedades de VoltKey Alpha Arduino 2.0.0

- **Circuitos prioriza el control:** al entrar, los botones/lista de los tres circuitos aparecen primero.
- El panel **Prototipo Arduino · 3 circuitos**, relés, pines, polaridad e indicador de tarjeta se trasladó al final de Circuitos.
- La opción **Botones / Lista** se trasladó a **Ajustes → Vista de circuitos** y el modo inicial en instalaciones nuevas es **Botones**.
- **VoltKey Tec** incorpora un Centro Técnico con accesos a anomalías, Arduino/relés, historial e informe Excel.
- VoltKey Tec añade **Salud física y trazabilidad**, comparando conexión del UNO, compatibilidad de firmware, tarjeta/red, relés confirmados y fuente de telemetría.
- VoltKey Tec añade un resumen de **Anomalías y seguimiento** con acceso directo a notas, estados y archivo.
- Se conservan sesión de mantenimiento, perfil fijado, tema técnico de alta atención, diagnóstico de enlace, inventario eléctrico, mantenimiento preventivo y las **5 reglas de oro**.
- Esta entrega es la última **carpeta completa** de la serie solicitada. Desde la siguiente actualización se trabajará en modo incremental: solo archivos cambiados y respaldo únicamente de los archivos que serán reemplazados.

La identidad Android/Expo continúa usando el mismo paquete de esta edición para conservar instalación y datos; `versionCode` avanza a 4.

## Edición servidor físico Arduino UNO R3

Esta edición convierte el UNO R3 en servidor físico de un prototipo de tres circuitos: **General**, **1er piso** y **2do piso**. General funciona como maestro; el Arduino conserva tarjeta, configuración de relés, estado y reglas esenciales aun cuando el computador o Internet se desconectan.

El UNO R3 **no puede conectarse a Internet directamente por USB**: necesita que el computador traduzca su puerto serie hacia la red. La distribución del trabajo es:

```text
Aplicación VoltKey en celular/PC
            ↕ Internet o red local
Pasarela Python VoltKey 1.12.0 en el computador
            ↕ Cable USB · 115200 baudios
Arduino UNO R3 → tarjeta, EEPROM y tres salidas físicas
```

Consulta [LEEME-ARDUINO-UNO-R3.md](LEEME-ARDUINO-UNO-R3.md) antes de conectar la placa.

### Prueba rápida del UNO

1. Instala Arduino IDE.
2. Ejecuta `Actualizar-Arduino.cmd`; detectará el puerto, compilará y subirá el firmware.
3. Si no encuentra Arduino CLI, abre el `.ino` indicado y súbelo mediante Arduino IDE.
4. Cierra el Monitor Serie y Arduino IDE para liberar el puerto.
5. Ejecuta `Probar-Arduino.cmd` para verificar enlace, firmware, EEPROM, tarjeta/LED y relés.
6. Ejecuta `Iniciar-VoltKey.cmd` y revisa **Circuitos → Prototipo Arduino**.

La detección del puerto es automática. Si necesitas fijarlo, define `VOLTKEY_ARDUINO_PORT=COM3` antes de iniciar VoltKey.

Aplicación Expo/React Native para supervisar y controlar un tarjetero energético doméstico desde el celular y el computador. Esta edición usa el UNO R3 como servidor físico y una pasarela Python para Internet, historial eléctrico, diagnóstico orientativo, exportación Excel y programación horaria.

La edición **ARDUINO TEST 1.2**, construida sobre la base **Alpha 1.12.0**, está pensada para demostrar VoltKey a personas que aún no conocen el proyecto. VoltKey existe para unir una interfaz comprensible con un controlador físico: permite ver qué circuito se pidió activar, confirmar qué salida aplicó realmente el Arduino y explicar por qué cambió cada estado. Esta edición conserva las funciones compatibles y limita el catálogo a las tres salidas reales del prototipo.

## Cambios propios de ARDUINO TEST 1.2

- Nueva sexta ventana **Tutorial**, visible al instalar: explica el problema que resuelve VoltKey, el recorrido aplicación–USB–Arduino y una demostración segura paso a paso.
- El Tutorial puede ocultarse desde **Ajustes → Mostrar sexta ventana**. Al ocultarlo quedan únicamente las cinco ventanas principales; puede restaurarse cuando sea necesario.
- VoltKids puede permanecer en **Ajustes** y **Tutorial** incluso después de sincronizar o recibir estados del Arduino. Solo cambia de ventana por una acción voluntaria o si el Tutorial fue ocultado.
- Desde Ajustes VoltKids se puede volver a un perfil administrador mediante PIN, sin exponer configuración eléctrica ni herramientas técnicas.
- Catálogo inicial y permanente de tres slots: **GENERAL**, **1ER PISO** y **2DO PISO**.
- El panel del prototipo está dentro de **Circuitos**, con comparación `APP` frente a `RELÉ/LED`.
- Una orden no se considera confirmada hasta recibir el acuse físico del UNO. Para la tarjeta y la red, la pasarela también acepta el estado autoritativo solicitado si se pierde el mensaje directo y realiza una consulta de comprobación antes de mostrar un error.
- Los cambios de pin también esperan confirmación del UNO. Si detecta un firmware anterior a ARDUINO TEST 1.2, los controles físicos permanecen bloqueados hasta ejecutar `Actualizar-Arduino.cmd`.
- D12, D11 y D10 son el mapa inicial de los tres canales. Cada circuito puede elegir desde la aplicación un pin libre D2–D12, polaridad activa HIGH/LOW y pulso de prueba; el UNO conserva el mapa en EEPROM.
- El indicador de tarjeta comienza en D13, pero puede asignarse a un pin libre D2–D13, elegir polaridad HIGH/LOW, pulso de prueba y velocidad de parpadeo por corte entre 0,25 y 2 segundos.
- Estados del indicador: **fijo** con tarjeta y red; **parpadeo configurable** durante un corte; **parpadeo de 1 segundo** durante la cuenta regresiva al retirar la tarjeta; **apagado** al terminar la cuenta regresiva.
- El estado de cuenta regresiva y el modo instantáneo del LED se informan por USB, para que la aplicación muestre lo que el UNO está ejecutando realmente.
- El tarjetero comienza habilitado y su LED comienza encendido de forma fija. El contacto físico A0–GND puede retirarlo después.
- **Aporte VoltKids** está en Energía. El selector del perfil activo aparece únicamente en Ajustes.
- Los tres circuitos se pueden editar por completo; sus slots físicos no se pueden duplicar, archivar ni eliminar en esta edición de prueba.
- La EEPROM migra el mapa, polaridad e intervalo guardados por ARDUINO TEST 1.1 sin borrar la configuración física.
- Android independiente actualizado a `versionCode 3`; la base Alpha y el firmware principal continúan identificándose como 1.12.0.

> El cambio de pin modifica la salida que usa el Arduino. No puede cambiar las pistas internas de un shield: selecciona los pines a los que estén conectados físicamente sus canales y no repitas el pin del indicador de tarjeta.

> Para que el indicador parpadee durante un corte real, el UNO debe seguir alimentado por USB desde un computador, UPS o fuente de respaldo de 5 V. Si el Arduino pierde su propia alimentación, ningún LED puede permanecer activo.

## Novedades de v1.12.0

- Prototipo físico de tres circuitos: General, 1er piso y 2do piso.
- Dependencia segura: apagar General apaga ambos pisos; ningún piso enciende sin General.
- Configurador de relés D2–D12, polaridad activa HIGH/LOW y pulso de prueba individual.
- Entrada física de tarjeta en A0 y LED integrado como indicador presente/ausente.
- Estado, política esencial, pines y polaridad persistentes en EEPROM para funcionamiento sin conexión.
- Prueba guiada de Arduino, firmware, tarjeta/LED, mapa de relés, USB y EEPROM.
- Trazabilidad del origen físico: aplicación, tarjeta, emergencia, pérdida de enlace o General apagado.
- Parada de emergencia de cargas no esenciales sin cambiar perfiles ni configuración.
- `Actualizar-Arduino.cmd` con detección de puerto, compilación y carga automática.
- Android actualizado a `versionCode 18`.

## Novedades de v1.11.0

- Historial de actividad con perfil, dispositivo, fecha, circuito, resultado y detalle de cada cambio.
- Diagnóstico **Ver por qué cambió** cuando un circuito recibe otro estado por horario, tarjetero, red, servidor o segundo dispositivo.
- Editor completo para todos los circuitos, incluido **Iluminación**: nombre, habitación, icono, potencia, umbral individual, prioridad, datos técnicos y notas.
- Acciones para duplicar, archivar, restaurar y eliminar definitivamente cualquier circuito; los cambios se conservan al reconectar.
- La fase de los horarios también se guarda en el dispositivo, evitando que Iluminación u otra carga vuelva al estado anterior al reabrir la aplicación dentro de la misma franja.
- Búsqueda de circuitos y filtros por habitación.
- Solicitudes VoltKids autorizables **una vez**, **durante una hora** o **permanentemente**, validadas también por el servidor.
- Misiones VoltKids sobre reutilización, reciclaje, cuidado ambiental y reducción segura de cargas, con insignias y resumen para padres.
- Academia VoltKids Hacker ampliada con tensión, corriente, potencia, energía, resistencia, corriente alterna, protecciones y costo.
- Sesión VoltKey Tec con responsable, motivo, cronómetro, lista de mantenimiento y perfil completamente congelado; VoltKids no se muestra dentro del entorno técnico.
- Centro unificado de notificaciones para anomalías, permisos, diagnósticos, conexión y mantenimiento.
- Copia de seguridad y restauración de circuitos, perfiles, horarios, permisos y preferencias.
- Guía rápida para usuarios nuevos y acceso permanente al historial, archivo y respaldos desde Ajustes.
- Sonidos diferenciados para botones, encendido, apagado, confirmación, eliminación, alertas y transiciones, reprocesados con menor volumen y agudos suaves.
- Controles independientes **Sonidos de interfaz** y **Vibración táctil**, más un botón **Silencio total**; las preferencias quedan guardadas por dispositivo.
- Android actualizado a `versionCode 17`.

## Novedades de v1.10.2

- El sector **Perfil de uso** desaparece de todos los encabezados mientras VoltKey Tec está activo.
- En la interfaz de computador también se oculta el selector de perfil del menú lateral.
- Ajustes no muestra administración familiar ni el selector Perfil de uso dentro del entorno técnico.
- El perfil administrador con el que se entra en VoltKey Tec queda congelado hasta salir del modo.
- Se bloquean por lógica interna los cambios Administrador → Administrador y Administrador → VoltKids, incluso si quedara abierta una ventana anterior durante la transición.
- Al salir de VoltKey Tec reaparece el selector y vuelve a permitirse el cambio normal de perfiles mediante PIN.
- La prueba de sonidos no continúa en esta versión; la 1.10.1 se conserva como edición experimental sonora.
- Android actualizado a `versionCode 16`.

## Novedades de v1.10.1

- Los horarios actúan al comenzar y terminar su franja; ya no reescriben una orden manual cada cinco segundos.
- Confirmación de cada orden mediante identificadores sincronizados, evitando saltos visuales por respuestas antiguas del servidor.
- Todos los circuitos, incluidos los predeterminados como **Iluminación**, se pueden editar, actualizar o eliminar.
- Un circuito predeterminado eliminado no vuelve a crearse al reiniciar; el catálogo completo se conserva y sincroniza.
- Al eliminar un circuito también se limpian sus horarios, permisos VoltKids y solicitudes pendientes.
- VoltKey Tec muestra exclusivamente perfiles administradores y oculta perfiles, avisos y administración de VoltKids hasta salir del entorno técnico.
- Prueba de sonidos suaves para botones, interruptores, encendido, apagado, guardado, eliminación, alertas y transiciones.
- Los sonidos pueden desactivarse desde **Ajustes → Sonidos de interfaz** y se incluyen exclusivamente para evaluar esta versión.
- Android actualizado a `versionCode 15`.

## Novedades de v1.10.0

- El centro de **Anomalías** conserva la posición de desplazamiento aunque lleguen nuevas lecturas, cambie el estado de conexión o se actualice la telemetría.
- **VoltKids Oscuro** usa la paleta VoltKey Pulse y pasa a ser el valor predeterminado; la actualización migra una vez el antiguo tema Claro predeterminado.
- **VoltKids Claro** adopta la paleta Inicio Fácil.
- Entrada y salida de **VoltKids Hacker** con una transición propia que recuerda que los permisos continúan protegidos.
- Terminal Hacker ampliada con lecturas de voltaje, potencia, corriente estimada, estado de enlace y datos nominales por circuito.
- **Academia Eléctrica** infantil de solo lectura con conceptos de V, A, W, kWh y `P = V × I`, acompañada de límites de seguridad claros.
- VoltKids Hacker puede solicitar acceso a circuitos no autorizados, revisar el estado y cancelar solicitudes pendientes.
- El administrador recibe un aviso sincronizado, una insignia de pendientes y una bandeja para **Aprobar / Rechazar**. Aprobar añade el circuito a los permisos del perfil.
- Nueva sección **Misión Eco** con consejos sobre reutilización, reciclaje, luz natural, refrigeración y reducción segura de cargas del hogar.
- El **Perfil de uso** aparece en una barra compacta y permanente bajo cada encabezado, sin cubrir el contenido principal.
- Android actualizado a `versionCode 14`.

## Novedades de v1.9.0

- **VoltKey Pulse** es la paleta predeterminada para instalaciones nuevas; las elecciones guardadas en versiones anteriores se respetan.
- Las herramientas de **VoltKey Tec** aparecen directamente en la pestaña Inicio después de confirmar el cambio de modo.
- Encender o apagar desde un administrador ya no bloquea automáticamente a VoltKids.
- Cada circuito incorpora una acción explícita **Bloquear para VoltKids / Liberar a VoltKids**; solo ese bloqueo otorga prioridad persistente al administrador.
- La migración elimina los bloqueos automáticos heredados de v1.8.0 sin modificar el estado, nombre, potencia, prioridad esencial ni permisos de los circuitos.
- El límite de demanda elevada se puede elegir entre **100 y 50.000 W** y se sincroniza entre celular, computador y servidor.
- El centro de anomalías separa **En revisión** y la subcarpeta **Resueltas**, donde conserva lecturas, notas y fechas archivadas.
- VoltKids usa una interfaz más simple y ofrece tres temas propios: **Claro**, **Oscuro** y **Hacker**.
- El tema Hacker presenta al niño como agente y emplea una estética de terminal cinematográfica sin habilitar funciones técnicas.
- Se mantiene la cuenta regresiva visible y cancelable de 10 segundos; cualquier cambio administrativo o de seguridad durante la espera cancela la acción infantil.
- Android actualizado a `versionCode 13`.

## Novedades de v1.8.0

- Navegación principal reducida a cinco secciones: **Inicio, Circuito, Energía, Respaldo y Ajustes**.
- En VoltKids, encender o apagar un circuito autorizado inicia una cuenta regresiva visible y cancelable de **10 segundos** antes de aplicar la orden.
- Si un administrador fija el estado durante la cuenta regresiva, su decisión conserva la prioridad y la acción de VoltKids se cancela.
- **Sincronización en vivo** se trasladó desde Inicio a Ajustes para mantener el panel principal más limpio.
- El botón **Añadir circuito** permanece siempre después del último circuito, incluso cuando el usuario crea nuevas cargas.
- Control compacto del tarjetero junto al selector de vista de Circuitos y panel ampliado en Ajustes con estado, demora, política, protegidos y restauración.
- Las anomalías aparecen como notificaciones dentro de Circuitos y abren un centro independiente con filtros, diagnóstico y seguimiento.
- Respaldo muestra autonomía aproximada, tiempo de carga al 100 %, salud, capacidad efectiva, ciclos y temperatura de las baterías.
- Las herramientas de VoltKey Tec siguen disponibles desde Ajustes sin añadir una sexta opción a la navegación principal.
- Android actualizado a `versionCode 12`.

## Novedades de v1.7.0

- Nueva pestaña **Anomalías** con registro cronológico unificado de caídas de voltaje, sobretensiones, puntas de corriente y consumos elevados.
- Resumen del periodo con eventos totales, críticos, pendientes y resueltos; filtros por medición y estado.
- Detalle de cada anomalía con fecha, hora, valor, causas posibles, acción inmediata y orientación de soporte o mantención.
- Seguimiento **Pendiente / Revisada / Resuelta** y notas sincronizadas entre celular y computador.
- La hoja **Anomalías** del archivo Excel incluye ahora el estado y las notas de revisión.
- El modo infantil pasa a llamarse **VoltKids**, con identidad propia en introducción, encabezado, navegación y perfiles.
- Las decisiones manuales del administrador tienen prioridad: al encender o apagar una carga, VoltKids no puede contradecir ese estado aunque tenga permiso sobre el circuito.
- El administrador puede pulsar **Liberar a VoltKids** para devolver el control del circuito sin alterar su estado actual.
- La prioridad se valida tanto en la interfaz como en el servidor central y se sincroniza en todos los dispositivos.
- Navegación inferior desplazable para que la nueva pestaña no comprima ni oculte botones en celulares pequeños.
- Android actualizado a `versionCode 11`.

## Novedades de v1.6.0

- Perfiles familiares persistentes y sincronizados entre celular y computador.
- Perfil **Normal** con control absoluto, administración de familiares y acceso a VoltKey Tec.
- Perfil **Niños** con navegación simplificada y botones grandes únicamente para circuitos autorizados.
- PIN de cuatro dígitos para volver a un perfil normal desde la interfaz infantil.
- Alta, edición y eliminación de hasta 12 perfiles; el sistema conserva siempre al menos un perfil normal.
- Permisos configurables por circuito desde **Ajustes → Perfiles familiares**.
- Restricciones aplicadas en la interfaz y en el servidor: un perfil infantil no puede cambiar prioridades, tarjetero, red, temporizadores, inventario ni ajustes.
- Selector de perfil permanente en el encabezado y en el menú de computador.
- Logo oficial de VoltKey Tec en su transición, encabezado, menú y panel técnico.
- Android actualizado a `versionCode 10`.

## Novedades de v1.5.2

- Desplazamiento vertical reforzado en PC y dispositivos grandes: rueda, trackpad, barra nativa y controles flotantes para subir o bajar.
- El encabezado y el menú permanecen fijos mientras cada pantalla desplaza su contenido de forma independiente.
- Selector de circuitos **Vista actual / Botón grande**, guardado en el dispositivo.
- La vista de botón grande muestra un control cuadrado por carga y una estrella inferior independiente para definir la prioridad.
- Confirmación antes de entrar a **VoltKey Tec** y transición que recuerda trabajar con cuidado.
- Tema técnico rojo de alta atención, identidad **VoltKey Tec** y acceso directo a las herramientas avanzadas.
- Panel con las cinco reglas de oro, aviso de personal autorizado y referencia de seguridad ACHS.
- Al salir de VoltKey Tec se restaura automáticamente la paleta normal elegida previamente.

## Novedades de v1.5.1

- Todas las pantallas pueden desplazarse con la rueda del mouse o la barra vertical en modo computador.
- El menú lateral permanece fijo y el contenido central se desplaza de forma independiente.
- Funciona también en monitores o ventanas con poca altura.
- El icono de VoltKey aparece permanentemente en los encabezados y en la navegación de PC.
- Nueva tarjeta **Acerca de VoltKey** en Ajustes con el emblema y la versión instalada.

## Novedades de v1.5.0

- Al volver a Expo Go o a la APK desde segundo plano, VoltKey descarta el enlace antiguo y crea uno nuevo automáticamente.
- Un vigilante comprueba que el servidor siga respondiendo; si la conexión queda detenida, aplica reintentos progresivos sin duplicar sockets.
- El botón **Reconectar ahora** ofrece una recuperación manual desde Ajustes.
- **Modo hogar** mantiene una interfaz sencilla para el uso cotidiano.
- **Modo técnico** añade diagnóstico eléctrico, estabilidad y latencia del enlace, anomalías, inventario de circuitos y mantenimiento preventivo.
- Selector **Automática / Celular / Computador**. La interfaz celular respeta las áreas seguras de Android y la interfaz de computador utiliza navegación lateral.
- La preferencia de perfil, interfaz y lista de mantenimiento queda guardada en el dispositivo.

## Novedades de v1.4.0

- Tarifa de respaldo de **$280 CLP/kWh**, coherente con el valor BT1 de referencia solicitado.
- Consulta automática del [tarifario oficial vigente de Edelaysen](https://www.gruposaesa.cl/edelaysen/tarifas-vigentes) al iniciar y una vez por mes.
- El servidor lee el pliego PDF, calcula el cargo variable BT1 con IVA, conserva la última tarifa válida y vuelve a intentar si el sitio no responde.
- Notificación sincronizada en celular y computador: “Se ha actualizado el precio del kWh a $X”.
- En Ajustes se muestran empresa, plan, vigencia, última revisión, estado y un botón de actualización manual.
- Nueva paleta clara **Inicio fácil**, recomendada y aplicada por defecto en instalaciones nuevas.
- Jerarquía visual mejorada: paneles más limpios, contraste reforzado, sombras suaves, métricas destacadas y barra del sistema adaptada al tema.
- El iniciador ya no falla cuando el registro de Cloudflare todavía está vacío y ahora muestra el error real si el túnel termina.

## Novedades de v1.3.0

- Sincronización bidireccional mediante WebSocket: tarjeta, red, circuitos, prioridades y temporizadores comparten un único estado.
- Panel que muestra celular, computador, cantidad de clientes, latencia y última sincronización.
- Pestañas de **Voltaje**, **Corriente**, **Consumo** y **Costo estimado** con fórmula, conversión, estabilidad, tendencia, anomalía más reciente y acciones sugeridas.
- Historial seleccionable de **1 mes, 3 meses, 6 meses o 1 año**.
- Archivo Excel `.xlsx` con hojas de historial, resumen, anomalías, circuitos y programaciones.
- Recomendaciones dinámicas, ranking de cargas potentes y advertencias por demanda simultánea.
- Temporizadores digitales por circuito, hora de encendido, hora de apagado y días de la semana. Admiten horarios que cruzan medianoche.
- El servidor ejecuta horarios aunque la aplicación esté cerrada, siempre que Python continúe encendido.
- Inicio unificado de Python, túnel Cloudflare, Expo Tunnel e interfaz web con un doble clic.

Se mantienen las funciones anteriores: circuitos esenciales, demora de 5 segundos al retirar la tarjeta, respaldo por batería simulado, alta de circuitos desde texto/foto/ficha web, cinco paletas y cuatro tipografías.

Consulta [CHANGELOG.md](CHANGELOG.md) para ver las versiones anteriores.

## Inicio completo en Windows

### Requisitos (solo la primera vez)

1. Instala [Node.js LTS](https://nodejs.org/).
2. Instala [Python 3.11 o superior](https://www.python.org/downloads/) y selecciona **Add Python to PATH**.
3. Instala Cloudflared en PowerShell:

```powershell
winget install --id Cloudflare.cloudflared
```

### Encender todo

1. Descomprime la carpeta completa.
2. Haz doble clic en `Iniciar-VoltKey.cmd`.
3. En la primera ejecución se instalarán las dependencias de Node y Python.
4. El iniciador crea el servidor, obtiene una URL pública, escribe `.env`, abre la interfaz del computador y muestra el QR de Expo.
5. Abre Expo Go en el celular y escanea el QR.
6. Deja la ventana abierta. `Ctrl+C` detiene Expo, el túnel y el servidor.

El celular y el computador pueden estar en redes distintas. Los dos necesitan internet. La dirección rápida de Cloudflare cambia en cada arranque, pero el iniciador actualiza `.env` automáticamente antes de abrir Expo.

Si el servidor ya funciona y `.env` contiene una URL válida, usa `Iniciar-App-Solo.cmd`.

## Inicio manual para desarrollo

Abre tres terminales en la carpeta del proyecto.

Terminal 1:

```powershell
python -m pip install -r servidor\requirements.txt
$env:VOLTKEY_TOKEN="un-token-largo"
python -m uvicorn servidor.voltkey_server:app --host 127.0.0.1 --port 8000
```

Terminal 2:

```powershell
cloudflared tunnel --url http://127.0.0.1:8000
```

Terminal 3, después de copiar la URL de Cloudflare a `.env`:

```powershell
npm install
npx expo start --tunnel --web --clear
```

Ejemplo de `.env`:

```env
EXPO_PUBLIC_WS_URL=wss://nombre.trycloudflare.com/ws
EXPO_PUBLIC_API_URL=https://nombre.trycloudflare.com
EXPO_PUBLIC_VOLTKEY_TOKEN=el-mismo-token-del-servidor
```

## Actualizar desde la versión anterior

Cada entrega incluye dos archivos: una carpeta completa y un paquete **ACTUALIZACIÓN**. Para conservar tu configuración de v1.10.2:

1. Descomprime `VoltKey-Alpha-v1.11.0-ACTUALIZACION-desde-v1.10.2.zip`.
2. Copia la carpeta de actualización completa dentro de tu proyecto v1.10.2.
3. Ejecuta `Aplicar-Actualizacion.cmd` desde esa carpeta.
4. El instalador valida la versión, crea una copia de los archivos reemplazados y aplica el contenido de `payload`.

El actualizador no modifica `.env`, `.voltkey-runtime`, `servidor/data` ni las fotografías/configuraciones guardadas por la aplicación.

## Uso dentro de la aplicación

- **Inicio:** potencia, telemetría y estado general del hogar, sin paneles de configuración.
- **Circuito:** control manual, clasificación esencial/no esencial, selector de vista, tarjetero compacto, notificaciones de anomalías y alta de circuitos siempre al final.
- **Energía:** periodo, análisis, Excel, cargas principales, recomendaciones y temporizadores.
- **Respaldo:** carga, autonomía, tiempo al 100 %, salud, ciclos, temperatura y cargas esenciales durante un corte simulado.
- **VoltKey Tec:** aparece en **Inicio** tras confirmar el acceso; aplica un tema rojo, congela el perfil administrador y reúne diagnóstico, comunicaciones, anomalías, inventario y mantenimiento.
- **Ajustes:** tarjetero ampliado, interfaz, paleta, tipografía, tarifario, sincronización y reconexión manual. La administración de perfiles se muestra únicamente fuera de VoltKey Tec.

### Configurar una familia

1. Abre **Ajustes → Perfiles familiares** desde un administrador.
2. Edita el perfil **Familia** y asigna un PIN de cuatro dígitos. Es obligatorio antes de entrar a VoltKids, para garantizar que puedas recuperar el control.
3. Edita **Niños** o pulsa **Añadir perfil**.
4. Selecciona **VoltKids** y marca los circuitos que podrá controlar.
5. Pulsa el selector de perfil del encabezado y elige el perfil VoltKids.
6. Para volver, selecciona un administrador e ingresa su PIN.

El selector permanece visible como **Perfil de uso** debajo del encabezado. En VoltKids puedes elegir Claro, Oscuro o Hacker. Hacker permite solicitar circuitos todavía no autorizados; la solicitud no cambia permisos por sí sola. Un administrador debe abrir la campana de notificaciones o la tarjeta de Inicio y aprobarla.

La Academia Eléctrica y los valores Hacker son educativos y de solo lectura. Un niño no debe abrir tableros, retirar tapas, tocar cables ni manipular enchufes dañados. Las intervenciones corresponden a adultos capacitados y autorizados.

Encender o apagar una carga desde un administrador es una acción normal y no quita el control a VoltKids. Para fijar una decisión, pulsa **Bloquear para VoltKids** en la vista detallada o de botones grandes; el estado actual quedará protegido hasta pulsar **Liberar a VoltKids**. Las protecciones del tarjetero, la falta de red y otras reglas de seguridad siempre pueden apagar una carga aunque exista un bloqueo administrativo.

Cada acción de encendido o apagado realizada desde VoltKids espera 10 segundos. La ventana muestra el circuito, la acción y la cuenta regresiva; el usuario puede cancelarla. Antes de ejecutar, VoltKey vuelve a comprobar los permisos, el tarjetero, la red y cualquier decisión administrativa recibida durante la espera.

El PIN de esta versión protege el uso cotidiano del prototipo, pero no sustituye una autenticación segura de producción. No reutilices claves personales o bancarias.

## Reconexión del celular

Mantén abierta la ventana de `Iniciar-VoltKey.cmd` en el computador. Puedes minimizar Expo Go o la APK y volver después: VoltKey intentará enlazarse automáticamente. Si Android conserva una conexión antigua, entra en **Ajustes → Reconectar ahora**.

Un Quick Tunnel de Cloudflare cambia de dirección cuando se detiene y vuelve a iniciar `Iniciar-VoltKey.cmd`. En ese caso vuelve a escanear el QR o recarga el proyecto en Expo Go para recibir el nuevo `.env`. Para una APK permanente conviene usar un túnel con dominio estable.

## Tarifa y factura estimada

VoltKey usa **BT1 residencial** como referencia. El cálculo mostrado corresponde al consumo registrado multiplicado por el precio del kWh; es una estimación y no sustituye la boleta. El pliego también contiene cargos fijos y otros conceptos que pueden variar según la comuna, el tramo de consumo y las condiciones del suministro.

Si la consulta oficial falla, el sistema mantiene la última tarifa válida; en una instalación nueva utiliza $280 CLP/kWh. La comprobación se repite automáticamente y nunca reemplaza la tarifa por un dato incompleto o fuera de rango.

Opcionalmente puedes cambiar el respaldo o desactivar la consulta automática antes de iniciar el servidor:

```powershell
$env:VOLTKEY_TARIFF_CLP="280"
$env:VOLTKEY_TARIFF_AUTO_UPDATE="0"
```

Para descargar Excel, selecciona un periodo y pulsa **Descargar tabla Excel**. En Android aparecerá el menú para guardarlo o compartirlo; en web se descarga desde el navegador.

## Historial y datos simulados

La primera ejecución crea un historial demostrativo de hasta un año en SQLite. Cada registro indica si es `simulation`, `live` o `mixed`, y la interfaz lo muestra explícitamente. El límite de potencia se configura en **Circuito → Notificaciones de anomalías → Límite de alerta**; los límites de voltaje y cualquier diagnóstico orientativo no reemplazan una medición profesional.

Para conectar un medidor externo, inicia el servidor con `VOLTKEY_SIMULATION=0` y envía `telemetry_input` según [PROTOCOLO-MEDIDOR.md](PROTOCOLO-MEDIDOR.md). El servidor seguirá registrando, analizando y retransmitiendo los datos a todas las interfaces.

## Inicio automático de Windows

Ejecuta `Activar-Inicio-Automatico.cmd` una vez. Para revertirlo, ejecuta `Desactivar-Inicio-Automatico.cmd`. El acceso automático inicia el sistema completo; Windows debe estar encendido y con sesión iniciada.

## Crear un APK

```powershell
npx eas-cli@latest login
npx eas-cli@latest build -p android --profile preview
```

El perfil `preview` de `eas.json` genera un APK instalable. Para una instalación doméstica permanente se recomienda alojar Python en una Raspberry Pi, mini-PC o VPS y usar un túnel con dominio estable, autenticación de usuarios y copias de seguridad.

## Seguridad

Este proyecto es un simulador y prototipo de supervisión. El token público y el PIN local incluidos en la app son protecciones básicas para demostración, no autenticación de producción. Un ESP32 o Raspberry Pi no debe conmutar cargas domiciliarias directamente: debe usar aislamiento, protecciones, contactores y transferencia certificados, dimensionados e instalados por personal autorizado.

Las cinco reglas mostradas en VoltKey Tec son un recordatorio y no autorizan una intervención. Deben aplicarse junto al procedimiento local, evaluación de riesgos, EPP e instrumentos adecuados por personal autorizado o cualificado.

## Referencias técnicas

- [Expo CLI y modo tunnel](https://docs.expo.dev/more/expo-cli/)
- [Expo Sharing](https://docs.expo.dev/versions/latest/sdk/sharing/)
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)
- [ACHS: seguridad en distribución eléctrica y reglas de oro](https://capacitacion.achs.cl/capacitaciones/seguridad-en-distribucion-electrica-reglas-de-oro-y-equipo-de-proteccion-presencial)
- [SEC: RIC N°17, operación y mantenimiento](https://www.sec.cl/sitio-web/wp-content/uploads/2021/01/RIC-N17-Operacion-y-Mantenimiento.pdf)
