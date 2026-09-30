# CHANGELOG

## VoltKey Alpha Arduino 2.1.0 — introducción por logros + niveles de información

- Sistema de introducción/tutorial basado en misiones y logros.
- Progreso independiente por perfil para Administrador y VoltKids.
- Progresión Mínimo → Esencial → Completo con aparición gradual de bloques y módulos.
- Ruta de misiones VoltKey Tec tras completar la introducción de Administrador.
- Tutorial omitible y reiniciable desde Ajustes.
- Configuración de información visible con tres presets editables.
- Eliminación de la referencia visible a “Base Alpha 1.12.0”; se muestra solo VoltKey Alpha Arduino 2.1.0.
- Android actualizado a `versionCode 5`.
- Esta distribución COMPLETA integra los archivos de 2.1.0 con todos los componentes de 2.0.0 necesarios para ejecutarse de forma independiente.

# Historial de versiones

## VoltKey Alpha Arduino 2.0.0 — interfaz prioritaria + VoltKey Tec ampliado

- Nueva identidad de aplicación **VoltKey Alpha Arduino 2.0.0**, manteniendo ARDUINO TEST 1.2 y firmware base 1.12.0 como protocolo físico compatible.
- Circuitos muestra primero los controles de las cargas; la búsqueda, anomalías y controles auxiliares quedan después.
- El panel de módulos Arduino, relés, pines, polaridad e indicador de tarjeta pasa al final de Circuitos.
- Selector **Botones / Lista** trasladado a Ajustes y modo Botones como valor inicial para nuevas instalaciones.
- VoltKey Tec incorpora Centro Técnico con accesos rápidos a anomalías, hardware, historial e informe Excel.
- Nuevo bloque de Salud física y trazabilidad: estado UNO, compatibilidad, tarjeta/red, confirmación de relés y fuente de medición.
- Nuevo resumen de Anomalías y seguimiento con pendientes, críticas, resueltas y acceso directo a notas/trazabilidad.
- Se mantienen las 5 reglas de oro, sesión técnica con responsable/motivo, diagnóstico WebSocket, inventario y mantenimiento preventivo.
- `app.json` y paquete actualizados a 2.0.0; Android `versionCode 4`.
- Se incluye respaldo previo únicamente de los archivos reemplazados en `_backup_pre_2.0.0/`.
- A partir de la próxima versión, las entregas serán incrementales y no volverán a copiar archivos sin cambios.

## VoltKey ARDUINO TEST 1.2 — base Alpha 1.12.0

- Corrección de VoltKids: Ajustes y Tutorial ya no vuelven automáticamente a Inicio durante una sincronización o cambio de estado.
- Indicador de tarjeta con cuatro estados físicos: fijo, parpadeo por corte, parpadeo de cuenta regresiva y apagado final.
- Intervalo de parpadeo por corte configurable desde Circuitos entre 0,25 y 2 segundos; la cuenta regresiva utiliza 1 segundo fijo.
- Pin D2–D13, polaridad HIGH/LOW y pulso de prueba del indicador conservados en la aplicación y EEPROM.
- Confirmación robusta de tarjeta y red: `CARDACK`/`GRIDACK`, consulta de `STATE` y aceptación exclusiva del estado autoritativo coincidente.
- Corrección del orden de arranque del indicador al retirar la tarjeta: el parpadeo comienza junto con la cuenta regresiva.
- Estado `CDOWN` y modo del LED informados por USB para mantener la aplicación sincronizada con el UNO.
- Migración de EEPROM y datos de ARDUINO TEST 1.1 sin restablecer pines, polaridad ni personalización de circuitos.
- Prueba guiada ampliada para retirada/inserción, corte/restablecimiento, indicador, tres relés, EEPROM y mapa de pines.
- Identidad Android independiente actualizada a `versionCode 3`; la base continúa en Alpha 1.12.0.

## VoltKey ARDUINO TEST 1.1 — base Alpha 1.12.0

- Corrección del bloqueo de navegación en VoltKids: incorpora un Ajustes limitado y permite volver al administrador mediante PIN.
- Sexta pestaña Tutorial para presentar el propósito de VoltKey, el recorrido de las órdenes y una demostración segura a usuarios nuevos.
- Opción en Ajustes para ocultar o restaurar Tutorial; al ocultarlo permanecen las cinco ventanas principales.
- Configuración desde Circuitos de los pines D2–D12, polaridad HIGH/LOW y prueba física de General, 1er piso y 2do piso.
- Prevención de pines duplicados entre los tres relés y el indicador de tarjeta.
- Indicador de tarjeta configurable en D2–D13, con polaridad HIGH/LOW y tarjeta presente siempre encendida de forma fija.
- Modo sin tarjeta seleccionable entre LED apagado o parpadeante, con intervalo de 0,25 a 2 segundos.
- Persistencia EEPROM y migración del mapa de relés de ARDUINO TEST 1.0 sin perder su configuración.
- Protocolo USB con confirmación del mapa, prueba e indicador de tarjeta.
- La aplicación espera el acuse del UNO antes de guardar un nuevo pin y bloquea los controles si todavía está instalado el firmware ARDUINO TEST 1.0.
- Identidad Android independiente actualizada a `versionCode 2`; la base de aplicación y firmware continúa en 1.12.0.

## VoltKey ARDUINO TEST 1.0 — base Alpha 1.12.0

- Variante independiente para Arduino UNO R3, sin cambiar la versión base 1.12.0.
- Inicio seguro con tarjeta habilitada, General encendido y ambos pisos apagados.
- Catálogo limitado a tres circuitos físicos editables: General, 1er piso y 2do piso.
- Confirmación obligatoria del estado por USB antes de aceptar una orden de la aplicación.
- Indicadores del relay shield sincronizados con cada circuito: D12, D11 y D10.
- Panel del prototipo trasladado a Circuitos con estados APP y RELÉ/LED.
- Aporte VoltKids trasladado a Energía y selector de perfil concentrado en Ajustes.
- Identidad Expo/Android separada (`voltkey-arduino-test`) para no alterar la edición normal.

## VoltKey Alpha 1.12.0 — Control físico guiado

- Servidor UNO R3 reducido a tres salidas de prototipo: General, 1er piso y 2do piso.
- Regla maestra aplicada en firmware y servidor: los pisos dependen de General.
- Mapa de relés y polaridad configurables, con rechazo de pines reservados o repetidos.
- Contacto físico de tarjeta A0, LED 13, demora, esenciales y memoria EEPROM autónoma.
- Panel de prueba guiada, diagnóstico de origen y parada inmediata de no esenciales.
- Actualizador automático del firmware con Arduino CLI y alternativa documentada para Arduino IDE.
- Android `versionCode 18`.

## VoltKey Alpha 1.11.0 — Trazabilidad, recuperación, aprendizaje y respuesta táctil

### Variante servidor físico Arduino UNO R3 por USB (misma versión)

- Estado autoritativo de tarjeta, nueve salidas, esenciales y demora conservado en la EEPROM del UNO R3.
- LED integrado del pin 13 reservado al tarjetero: encendido con tarjeta y apagado sin tarjeta.
- Iluminación trasladada al pin 12; circuitos 1–9 mapeados a los pines 12–4.
- Retirada de tarjeta y desconexión diferida de cargas no esenciales ejecutadas dentro del Arduino.
- Pasarela Python USB–Internet con detección y reconexión automática; al reconectar prevalece el estado físico del UNO.
- Bloqueo de órdenes físicas cuando el Arduino obligatorio está desconectado, evitando cambios falsos en pantalla.
- Estado, rol, LED, puerto y firmware visibles desde **Ajustes → Servidor Arduino UNO R3**.
- `Probar-Arduino.cmd` verifica tarjeta retirada/insertada y el LED integrado.
- La aplicación conserva nombre, `APP_VERSION`, firmware y `versionCode` de VoltKey Alpha 1.11.0.

- Historial sincronizado de controles, ediciones, bloqueos, perfiles, horarios, anomalías y mantenimiento.
- Diagnóstico visible del motivo por el que un circuito recibió un estado distinto.
- Edición persistente de cualquier circuito, incluido Iluminación, con habitación y umbral de anomalía individual.
- Persistencia de la fase horaria local para impedir reversiones al reabrir la aplicación dentro de una franja ya aplicada.
- Duplicación, archivo recuperable, restauración y eliminación definitiva de circuitos.
- Búsqueda de circuitos y filtros por habitación.
- Permisos VoltKids de una vez, una hora o permanentes con consumo y expiración sincronizados.
- Misiones ecológicas, insignias, ahorro educativo y resumen para perfiles administradores.
- Academia Hacker ampliada a ocho conceptos eléctricos de solo lectura.
- Sesión VoltKey Tec con responsable, motivo, cronómetro y lista de mantenimiento; perfil fijado hasta salir.
- Centro unificado de notificaciones, tutorial guiado y respaldo/restauración de configuración.
- Sonidos suaves y diferenciados en toda acción modificable, con limitación de repetición.
- Activación independiente de sonido y vibración, además de silencio total persistente por dispositivo.
- Versión Android incrementada a `versionCode 17`.

## VoltKey Alpha 1.10.2 — Perfil congelado en VoltKey Tec

- Eliminación del sector Perfil de uso en encabezados y navegación de computador durante el modo técnico.
- Ocultamiento de la administración familiar y del selector de modo Perfil de uso en Ajustes mientras VoltKey Tec está activo.
- Bloqueo interno de cualquier cambio Administrador → Administrador o Administrador → VoltKids hasta salir del entorno técnico.
- Cierre automático de selectores, PIN, solicitudes y formularios de perfil al entrar en VoltKey Tec.
- Conservación de una instantánea del administrador activo para impedir cambios provocados por sincronizaciones remotas.
- Retiro de la prueba sonora, conservada exclusivamente en VoltKey Alpha 1.10.1.
- Versión Android incrementada a `versionCode 16`.

## VoltKey Alpha 1.10.1 — Circuitos estables y prueba sonora

- Corrección del circuito Iluminación y de cualquier otra carga que regresaba sola por la reaplicación continua de horarios.
- Horarios ejecutados por cambio de fase: una vez al iniciar y otra al terminar, respetando modificaciones manuales intermedias.
- Confirmación sincronizada de órdenes para evitar que una instantánea antigua revierta visualmente un interruptor.
- Edición, actualización y eliminación de todos los circuitos, incluidos los predeterminados.
- Catálogo autoritativo persistente para que los circuitos eliminados no reaparezcan al reiniciar o reconectar.
- Limpieza automática de horarios, permisos y solicitudes vinculadas al borrar un circuito.
- Perfiles VoltKids, solicitudes y herramientas familiares ocultos mientras VoltKey Tec está activo.
- Prueba opcional de sonidos para todas las acciones táctiles modificables, exclusiva de esta revisión experimental.
- Versión Android incrementada a `versionCode 15`.

## VoltKey Alpha 1.10.0 — VoltKids Pulse, permisos y aprendizaje seguro

- Desplazamiento persistente del centro de Anomalías, sin saltos al llegar telemetría o cambios sincronizados.
- Tema VoltKids Oscuro basado en VoltKey Pulse y nuevo predeterminado; tema Claro basado en Inicio Fácil.
- Transición dedicada para entrar y salir de VoltKids Hacker.
- Terminal Hacker ampliada con telemetría, datos nominales, corriente estimada y conceptos eléctricos infantiles de solo lectura.
- Solicitudes de acceso por circuito desde VoltKids Hacker, con cancelación y estados pendientes.
- Notificación, insignia y bandeja de aprobación o rechazo para perfiles administradores.
- Permisos y solicitudes persistentes, sincronizados y validados en el servidor.
- Consejos Misión Eco sobre reducción de cargas, reutilización, reciclaje y cuidado ambiental.
- Barra compacta **Perfil de uso** visible en todas las pantallas principales.
- Versión Android incrementada a `versionCode 14`.

## VoltKey Alpha 1.9.0 — Pulse, bloqueo explícito y VoltKids simplificado

- VoltKey Pulse establecido como tema principal para instalaciones nuevas.
- Herramientas de VoltKey Tec integradas directamente en la pestaña Inicio.
- Encendido y apagado administrativo separados del bloqueo persistente de VoltKids.
- Botón explícito para bloquear o liberar cada circuito y migración segura de los bloqueos automáticos de v1.8.0.
- Límite de alerta de potencia configurable entre 100 y 50.000 W, persistente y sincronizado.
- Centro de anomalías dividido en las carpetas En revisión y Resueltas.
- Interfaz VoltKids reducida y tres temas propios: Claro, Oscuro y Hacker.
- Cancelación automática de una orden VoltKids pendiente si otro dispositivo cambia el circuito durante sus 10 segundos de espera.
- Versión Android incrementada a `versionCode 13`.

## VoltKey Alpha 1.8.0 — Navegación simple, temporización VoltKids y batería ampliada

- Navegación principal limitada a Inicio, Circuito, Energía, Respaldo y Ajustes.
- Cuenta regresiva visible y cancelable de 10 segundos para encender o apagar desde VoltKids.
- Revalidación de permisos y prioridad administrativa al terminar la espera infantil.
- Sincronización en vivo trasladada desde Inicio a Ajustes.
- Alta de circuitos reubicada siempre después del último circuito.
- Tarjetero compacto junto a la vista de Circuitos y panel completo con especificaciones en Ajustes.
- Centro de anomalías convertido en una ventana independiente de notificaciones abierta desde Circuitos.
- Respaldo ampliado con autonomía, tiempo de carga, salud, capacidad efectiva, ciclos y temperatura.
- VoltKey Tec disponible desde Ajustes sin ocupar una opción extra en la navegación.
- Versión Android incrementada a `versionCode 12`.

## VoltKey Alpha 1.7.0 — Anomalías, VoltKids y prioridad administrativa

- Pestaña general de anomalías con resumen, filtros, historial cronológico y detalle de cada evento.
- Orientación por falla: causas posibles, acción inmediata, soporte y mantención.
- Estados pendiente, revisada y resuelta con notas persistentes y sincronizadas.
- Exportación Excel ampliada con seguimiento y notas de anomalías.
- Identidad VoltKids aplicada a toda la experiencia del perfil infantil.
- Prioridad administrativa completa: una decisión manual de encendido o apagado no puede ser contradicha por VoltKids.
- Acción explícita para liberar nuevamente un circuito al control de VoltKids.
- Validación de permisos y prioridad en la aplicación y en el servidor central.
- Navegación inferior desplazable para acomodar la nueva pestaña en celulares pequeños.
- Versión Android incrementada a `versionCode 11`.

## VoltKey Alpha 1.6.0 — Perfiles familiares y nueva identidad VoltKey Tec

- Perfiles normales e infantiles persistentes, con selector disponible en celular y computador.
- Perfil normal con control absoluto, administración, alta, edición y eliminación de perfiles.
- Perfil infantil con navegación simplificada y controles grandes para circuitos previamente autorizados.
- PIN de cuatro dígitos para recuperar el control normal desde un perfil infantil.
- Sincronización de perfiles y permisos mediante el servidor central.
- Restricción de comandos infantiles tanto en la interfaz como en el servidor.
- Logo oficial de VoltKey Tec integrado en la transición, el encabezado, el menú y su panel principal.
- Eliminación automática de permisos que apunten a un circuito eliminado.
- Versión Android incrementada a `versionCode 10`.

## VoltKey Alpha 1.5.2 — Navegación reforzada, circuitos visuales y VoltKey Tec

- Desplazamiento vertical reforzado con contenedor de altura explícita, rueda/trackpad, barra visible y controles flotantes en modo computador.
- Dos vistas persistentes para circuitos: detallada y botones cuadrados grandes.
- Estrella de prioridad independiente debajo de cada botón grande.
- Confirmación y transición de seguridad al entrar o salir de VoltKey Tec.
- Tema técnico rojo de alta atención e identidad dinámica VoltKey / VoltKey Tec.
- Restauración automática de la paleta normal al salir del entorno técnico.
- Panel técnico con las cinco reglas de oro y advertencia para personal autorizado.
- Versión Android incrementada a `versionCode 9`.

## VoltKey Alpha 1.5.1 — Desplazamiento de PC e identidad visible

- Corrección del desplazamiento vertical en la interfaz de computador.
- El menú lateral permanece fijo mientras el contenido central se puede subir y bajar.
- Contenedores flexibles ajustados para pantallas de PC con poca altura.
- Icono de VoltKey visible en todos los encabezados y en el menú lateral.
- Nueva tarjeta **Acerca de VoltKey** en Ajustes con emblema y versión.

## VoltKey Alpha 1.5.0 — Reconexión, modo técnico e interfaces adaptables

- Reconexión automática al volver desde segundo plano, con vigilancia de conexión y reintentos progresivos.
- Botón **Reconectar ahora** en Ajustes y acción **Reiniciar enlace** en el panel técnico.
- Perfiles persistentes **Modo hogar** y **Modo técnico** para separar la operación cotidiana del diagnóstico avanzado.
- Panel técnico con tensión, desviación, corriente calculada, potencia, estabilidad, latencia, anomalías e inventario eléctrico.
- Lista local de mantenimiento preventivo con fecha de cada verificación.
- Interfaces **Automática**, **Celular** y **Computador** seleccionables por el usuario.
- Navegación lateral en computador y área segura inferior en Android para evitar que los botones del sistema cubran la aplicación.

## v1.4.0 — Tarifario automático y renovación visual

- Tarifa de respaldo actualizada a $280 CLP/kWh.
- Revisión mensual del pliego BT1 oficial de Edelaysen con conservación de la última tarifa válida.
- Notificaciones sincronizadas cuando aparece un nuevo tarifario.
- Datos de vigencia, fuente, estado y revisión manual desde Ajustes.
- Nueva paleta clara “Inicio fácil”, predeterminada para usuarios nuevos.
- Mejora de contraste, tarjetas, navegación, jerarquía y barra de estado adaptable.
- Corrección de la lectura del registro vacío de Cloudflare durante el arranque.
- Detalle visible de Cloudflare cuando el proceso de túnel falla.

## v1.3.1 — Corrección de inicio en Windows

- Se añadió la base de zonas horarias `tzdata` para `America/Santiago`.
- El servidor usa la zona horaria del sistema como respaldo si falta la base IANA.
- El iniciador valida Python 3.11 y muestra las últimas líneas del error automáticamente.

## v1.3.0 — Sincronización, historial y automatización

- Estado central compartido entre computador y celular.
- Historial y diagnóstico de voltaje, corriente, consumo y costo.
- Exportación Excel para 1, 3, 6 o 12 meses.
- Recomendaciones dinámicas y ranking de cargas.
- Temporizadores digitales ejecutados por el servidor.
- Inicio conjunto de Python, Cloudflare y Expo.

## v1.2.0 — Circuitos creados por el usuario

- Alta, edición y eliminación de circuitos.
- Datos técnicos por texto, foto o enlace a ficha técnica.
- Persistencia local e inicio automático opcional en Windows.

## v1.1.0 — Diseño y gestión energética

- Introducción de marca, interfaz tecnológica, paletas y tipografías.
- Nuevas cargas, selección de circuitos esenciales y respaldo por batería.
- Demora de 5 segundos al retirar la tarjeta.

## v1.0.0 — Simulador inicial

- Tarjetero, medidor, circuitos y control básico desde Expo Go.
