# 🧠 JARVIS.md — Memoria del Asistente

> 📍 **Ubicación**: este archivo vive en la RAÍZ del repo `github.com/MabriVM/voltkey` (desde 2026-09-30). Si lo estás leyendo desde otro PC, ya tienes la memoria más reciente después de un `git pull`.

> **PROTOCOLO OBLIGATORIO**: Al iniciar CUALQUIER sesión, leer este archivo completo antes de responder.
> Al finalizar una sesión con avances, ACTUALIZAR las secciones 4 y 6 y hacer `git push`.
> **Este archivo vive en el repositorio Git — es memoria compartida entre los PCs y Bionics de Mabri.**
> Ritual multi-PC: al empezar una sesión → `git pull` ANTES de leer este archivo (traer la memoria más reciente).
> Al terminar una sesión con avances → actualizar este archivo → commit → push, para que el otro cerebro lo reciba.

---

## 1. 👤 Quién soy

- **Nombre**: Mabri
- **Idioma de trabajo**: Español
- **Ubicación**: Coyhaique, Región de Aysén, Chile
- **Sistema**: Windows 11
- **Trabajo actual**: Técnico de mantención en Casino Dreams Coyhaique, desde 04/09/2024 (~2 años). Trabajo multidisciplinario: electricidad, cañerías, pintura, muebles, carpintería, soldadura, etc.
- **Certificaciones**: Operador de calderas autorizado por el Ministerio de Salud (MINSAL, Chile). Operador de calderas en el casino.
- **Background personal**: Estudió 1 semestre de Kinesiología en la Universidad Andrés Bello, Viña del Mar. Practicante de Jiu-Jitsu brasileño: faixa azul 2 graus (Academia Samyr Dorado, Team Pantera Coyhaique) y certificado como Monitor de Jiu-Jitsu nivel 1. Nota de Mabri: "no es tan relevante para los planes a futuro, pero es mejor tenerlo en cuenta".
- **Plan de estudios**: 2º año del técnico superior en electricidad → egresa ~junio 2027 → plan de ir en 2028 a estudiar ingeniería a Temuco (tiene amigos allá, red de apoyo)
- **Formación**: Técnico de nivel superior en electricidad
- **Nivel de programación**: Casi nulo (conocimiento eléctrico sólido, pero sin experiencia en código). **Regla: explicar el código en lenguaje simple/analogías eléctricas cuando sea posible, entregar código completo listo para usar, y nunca asumir que sabe configurar entornos de desarrollo.**

## 2. 🎯 Mis 3 frentes

### 📚 Frente 1: Estudios
- **Qué estudio**: Técnico de nivel superior en electricidad
- **Meta actual**: Aumentar conocimiento hacia la INGENIERÍA para poder trabajar independientemente
- **Sinergia**: su formación eléctrica + trabajo de mantención multidisciplinario alimentan directamente VoltKey y su visión de negocio. El trabajo actual (casino) es estable y le da ingresos mientras avanza el proyecto.

### 🎥 Frente 2: YouTube
- **Canal**: MABRI — https://www.youtube.com/@MABRISON
- **Nicho**: Humor principalmente, con videojuegos y momentos divertidos
- **Rol del canal en su vida**: es su "etapa sin preocupaciones" — diversión pura, sin presión de crecimiento. La única preocupación real es que el contenido se graba/acaba el fin de semana. NO forzar estrategias agresivas de crecimiento salvo que él lo pida.
- **Estado (a 2026-09-30)**: 44 suscriptores, 18 videos. Contenido recurrente: serie "MOMENTOS RANDOMS del MABRI y sus TILINES" (con amigos, playlist de 9 videos), Geometry Dash (demons) y Minecraft. Está reviviendo el canal: video "REVIVIENDO EL CANAL 💀" (#9 de la serie, hace ~3 semanas) y post de comunidad "PRÓXIMAMENTE..."
- **Frases de marca**: "¿CÓMO ESTÁN MIS TILINES?" — su comunidad son "los tilines"
- **Qué necesita del asistente**: (pendiente de definir: guiones, títulos, ideas de contenido, estrategia de crecimiento)

### 🏢 Frente 3: Empresa / Proyecto — **VoltKey**
- **Qué es**: Sistema inteligente de gestión energética para viviendas. Control de circuitos eléctricos, supervisión de consumo y automatización desde app móvil o PC. Objetivo: saber qué consume energía, controlar circuitos activos y reducir consumos innecesarios sin afectar cargas esenciales (refrigerador, router, alarmas, equipos definidos como esenciales).
- **Arquitectura actual**: App + servidor/intermediario + hardware físico (Arduino UNO, Relay Shield, ESP32). Tarjetero para detectar presencia: al retirar la tarjeta inicia cuenta regresiva y apaga circuitos no esenciales.
- **Funciones actuales de la app**: control individual de circuitos con reglas de dependencia; vista Botones/Lista configurable; perfiles Administrador y VoltKids; **VoltKey Tec** (diagnóstico, mantenimiento, anomalías, trabajo técnico); historial de consumo y anomalías; cálculo de consumo/potencia/costo; exportación; configuración de circuitos esenciales/no esenciales; personalización de interfaz, densidad, temas, sonido y vibración; tutorial con misiones y logros (progresión Perfil 3 → 2 → 1, con misiones extra de VoltKey Tec al completar el de Administrador); 3 niveles de información (Completo, Esencial, Mínimo) configurables por usuario.
- **Pendiente futuro**: integración de medición energética real.
- **Qué necesita del asistente**: (pendiente de definir: código, plan de negocio, documentación, presentación, etc.)
- **🚀 Visión de largo plazo — DOS productos independientes**:
  1. **VoltKey** (actual): aplicación para monitoreo y control del hogar con medidor inteligente. Su alcance termina en la gestión del hogar.
  2. **Segunda app (sin nombre aún)**: plataforma para **contratar o buscar trabajo** — tipo Uber/Tinder para eléctricos: conectar técnicos con clientes. Luego expandir a otros rubros, tipo LinkedIn pero mucho más fácil de usar: estrellas por trabajo, catálogo de trabajo y extras.

## 3. 🛠️ Herramientas y contexto

- **Stack disponible**: Bionic + LM Studio (modelos locales, gratuitos, ilimitados)
- **Suscripciones**: ChatGPT Plus (en evaluación de cancelación), Mammouth Starter
- **Regla de decisión**: usar modelos locales para tareas rutinarias; sugerir herramientas externas solo cuando la tarea lo amerite (ej: generación de imagen/video no es posible localmente aquí)

## 4. 📌 Estado actual (se actualiza en cada sesión)

*(Última actualización: 2026-09-30 — archivo creado)*

- [ ] Definir método de estudio preferido (Frente 1)
- [x] ✅ GITHUB FUNCIONANDO (2026-09-30): repo privado https://github.com/MabriVM/voltkey creado por Mabri. Primer commit `ed9ed76` subido (50 archivos, main conectado a origin). Git 2.56.0 instalado. Autenticación vía Git Credential Manager (login por navegador, ya autorizado en la torre). FLUJO DE TRABAJO: Bionic edita → commit → push; PC operación hace pull. NOTA: los pushes desde shell de Bionic pueden reportar exit code 1 por stderr de git — verificar el texto real ("[new branch]"/"main -> main") antes de asumir error.
- ARQUITECTURA DECIDIDA (2026-09-30): PC torre (sin USB libre, sin driver CH340, no movible) = DESARROLLO con Bionic; el otro PC = OPERACIÓN con Arduino UNO + servidor VoltKey corriendo. Guía de montaje completa en voltkey/montaje-pc-operacion.md. PENDIENTE: en el PC de operación instalar Git y hacer `git clone https://github.com/MabriVM/voltkey.git`.
- DECISIÓN DE NEGOCIO (2026-09-30): para el lanzamiento, VoltKey usará modelo centralizado en la nube (ESP32 de cada casa conecta directo, sin PC en el hogar) con reglas críticas locales en el hardware (híbrido). Documentado y explicado a Mabri.
- [x] 🎉 HITO (2026-09-30): VoltKey corriendo en el nuevo PC en modo demo (sin Arduino, servidor + app + navegador). Primer arranque exitoso del stack completo en este computador.
- [ ] Definir qué necesita del asistente en el canal de YouTube y cuál es el plan del "PRÓXIMAMENTE..." (Frente 2)
- [ ] VoltKey Fase 1 en curso: PZEM-004T VERIFICADO Y APROBADO para compra (artículo MLC-2086206859, ML Chile): 100A/22000W, Con CT incluido, interfaz TTL, 80-260VAC, 45-65Hz, precisión clase 1.0. HALLAZGO: la descripción confirma que el módulo guarda el kWh acumulado al cortar la alimentación ("停电数据存储" mal traducido) → el firmware NO necesita respaldar el contador en EEPROM. Pendiente: verificar en fotos que la pinza CT aparece (el listado de paquete solo dice "1× módulo"). Módulo en camino → siguiente: prueba en banco con firmware ya escrito.
- [x] ✅ RESUELTO (2026-09-30): Python 3.14.7 instalado (C:\Users\mauri\AppData\Local\Python\pythoncore-3.14-64) + dependencias del servidor ya instaladas por Mabri + SERVIDOR VERIFICADO: arranca y responde HTTP 200 en puerto 8000 (probado con VOLTKEY_SIMULATION=1 y VOLTKEY_ARDUINO_ENABLED=0). Nota: usar python -m pip (pip no está en PATH como comando suelto).
- [x] ✅ RESUELTO (2026-09-30): Node v24.21.0 + npm 11.19.0 instalados (C:\Program Files\nodejs). npm ci ejecutado: 719 paquetes instalados. VERIFICACIÓN COMPLETA DEL STACK: servidor HTTP 200 (puerto 8000) + Metro bundler "packager-status:running" (puerto 8081) simultáneos. STACK COMPLETO OPERATIVO EN ESTE PC.
- Contexto: Mabri operaba el proyecto antes desde OTRO computador; este PC ahora es el nuevo entorno de desarrollo.
- 2026-09-30: FIX aplicado a Iniciar-Sistema.ps1: el script ignoraba VOLTKEY_ARDUINO_ENABLED=0 y siempre exigía el UNO — ahora respeta el modo sin Arduino (editado en voltkey/app-base-2.1.0; sincronizar a la carpeta original de Mabri cuando la conozcamos). Mabri confirmó: sistema corriendo sin Arduino en modo demo.
- PENDIENTE PRÓXIMA SESIÓN: primera corrida real de la app con Expo Go en el celular — opciones: instalar cloudflared (winget install --id Cloudflare.cloudflared) para túnel, o EXPO_PUBLIC_WS_URL=ws://<IP-LAN-del-PC>:8000/ws en .env (localhost no funciona desde el teléfono) + permitir puerto 8000 en firewall de Windows.
- [ ] Compra masiva a China opcional: lista completa en voltkey/lista-compras-china.md (~$170.000 CLP, 3 prioridades: PZEM extra + ESP32 + relés + SCT-013 para Fase 2/3; DS18B20/RC522/RTC para VoltKey Tec; insumos de montaje). REGLA: protecciones eléctricas (automaticos, diferenciales, SPD) SIEMPRE locales/SEC, nunca de China. **Firmware ESP32 YA ESCRITO**: voltkey/firmware-esp32/VoltKey_Medidor_PZEM/VoltKey_Medidor_PZEM.ino + INSTRUCCIONES.md paso a paso. Base de la app (v2.1.0 completa: app Expo + servidor FastAPI puerto 8000 + firmware UNO R3) copiada en voltkey/app-base-2.1.0. El servidor YA acepta telemetry_input (V, A, W, kWh) con VOLTKEY_SIMULATION=0 y calcula costo en CLP. Pendiente: Mabri compra el módulo → arma el hardware según esquema → sube el firmware → prueba en banco.
- [x] Reparto de suscripciones decidido (2026-09-30): cancelar Mammouth Starter (ningún frente lo necesita críticamente; ahorro $144/año para el fondo VoltKey). Mantener ChatGPT Plus por ahora; reevaluar en 2027-2028 si Bionic + memoria jarvis.md alcanza para soltarlo también. *Condición: si usó Veo/Kling o multi-modelo intensivamente el último mes, reevaluar antes de cancelar.*

## 5. 📜 Decisiones y acuerdos importantes

*(Registrar aquí decisiones tomadas en sesiones, ej: "se decidió cancelar X", "el canal usará formato Y")*

- 2026-09-30: Se creó este sistema de memoria. Objetivo: replicar la utilidad de ChatGPT Plus con Bionic para poder cancelar esa suscripción.
- 2026-09-30: Meta de estudios definida: avanzar hacia ingeniería para trabajar independientemente.
- 2026-09-30: Visión de negocio definida en DOS productos: VoltKey (gestión del hogar, alcance limitado al hogar) y una segunda app independiente para contratar/buscar trabajo de eléctricos (futuro: expandir a multi-rubro tipo LinkedIn fácil con estrellas y catálogo).
- 2026-09-30: Timeline educativo fijado: egreso del técnico ~junio 2027, ingeniería en Temuco desde 2028. Trabaja como técnico de mantención en Casino Dreams Coyhaique desde 04/09/2024.
- 2026-09-30: Canal MABRI definido como "etapa sin preocupaciones" — entretenimiento, no proyecto de negocio. Presión mínima.

## 6. 📖 Bitácora de sesiones

*(Una línea por sesión: fecha + qué se hizo + qué sigue. Mantener máximo ~20 entradas; archivar las viejas al final del archivo.)*

- 2026-09-30: Creación de jarvis.md y definición del protocolo de memoria.
- 2026-09-30: Investigado el canal MABRI en vivo: 44 subs, 18 videos, reviviendo el canal (video #9 hace 3 semanas + post "PRÓXIMAMENTE..."). Registrada la visión completa de VoltKey y la meta de estudios.
- 2026-09-30: Iniciada Fase 1 de medición de VoltKey: recomendado PZEM-004T v3.0 100A con CT. Mabri adjuntó la base completa del proyecto (VoltKey-Alpha-Arduino-2.1.0: app Expo/React Native + servidor Python FastAPI + firmware UNO R3 + protocolos documentados) → copiada a voltkey/app-base-2.1.0. Hallazgo clave: el servidor ya implemente telemetry_input según PROTOCOLO-MEDIDOR.md, así que el firmware ESP32 solo debe leer el PZEM y enviar ese JSON. Firmware escrito (v1.0.0) + instrucciones. Descubierta también la fuente de tarifa Edelaysen/Saesa en .env.example — el servidor ya está pensado para Aysén.

---

### 📎 Archivado (historial viejo)

*(Mover entradas antiguas de la bitácora aquí cuando supere 20 líneas)*
