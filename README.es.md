# Keelokit Studio

**Convertí un producto terminado en explainers, demos, tutoriales y guías, directamente desde su propio repositorio.**

*[keelokit.com](https://keelokit.com) · [Read in English](README.md)*

Construiste algo y funciona. Ahora necesitás que la gente lo entienda: un video corto que muestre
qué hace, un recorrido para usuarios nuevos, una guía para el centro de ayuda, algunos posts.
Ese trabajo suele quedar para el final, y cuando se lo dejás a una IA tiende a sonar muy bien
mientras afirma cosas que nadie comprobó.

Keelokit Studio es un plugin de Claude Code que hace ese trabajo desde adentro de tu proyecto.
Lee tu repositorio y tu documentación, te pregunta solo lo que no puede averiguar, y después
trabaja como una pequeña agencia de marketing: decide qué vale la pena hacer y en qué orden,
escribe guiones completos escena por escena, especifica las capturas o grabaciones exactas que
necesita cada escena, y genera previews y video. Cada afirmación de un guion tiene que apuntar a
algo real de tu producto, y nada sale sin que lo hayas revisado vos.

Construyo con agentes de código y mantengo esto como hobby, junto a
[Keelokit](https://github.com/leosimini/keelokit), el harness que uso para construir los
productos. Studio es su hermano: Keelokit te ayuda a construir la cosa, Studio te ayuda a
explicarla. Es opinionado y joven; quedate con lo que te sirva.

## Qué podés producir

- **Explainers y videos demo de producto.** Una promesa, un recorrido por el producto real y un
  llamado a la acción, con guion escena por escena: narración, texto en pantalla y tiempos. El
  video está diseñado, no solo armado: ventanas de navegador y de teléfono, movimientos de
  cámara que recortan y hacen zoom a la parte de tu pantalla que prueba lo que se dice,
  anotaciones y un cursor animado que siguen el zoom, fundidos, subtítulos, locución y música
  opcionales, y una versión con movimiento reducido.
- **Tutoriales.** Videos paso a paso que respetan los requisitos previos y el orden en que el
  producto realmente funciona.
- **Guías escritas.** Guías tipo centro de ayuda, construidas con el mismo material verificado
  que los videos, para que nunca se contradigan.
- **Cortes para redes.** Adaptaciones cortas de la misma historia para cada canal y formato.
- **Todos los idiomas que necesites.** Decile a Studio en qué idiomas querés y cada pieza se
  produce en cada uno como su propia versión, con guion, subtítulos, evidencia y revisión
  propios, renderizada con el mismo diseño de video.
- **Material de producción que una persona puede usar.** Guiones en Markdown, la lista exacta de
  capturas y grabaciones que necesita cada escena, subtítulos en WebVTT y SRT, previews PNG, un
  render MP4 y paquetes por canal listos para que publiques a mano.
- **Un plan, no solo una pila de archivos.** Una lista priorizada de qué producir y qué publicar
  primero, con las razones y las fuentes detrás de cada decisión.

## Cómo funciona

Abrís Claude Code en el repositorio que querés explicar y corrés `/keelokit-studio:start`. A
partir de ahí Studio sigue la misma secuencia que una buena agencia:

1. **Entender el producto.** Lee tu README, docs, manuales y material de marca, y te dice qué
   falta o está desactualizado. Pregunta solo por los vacíos y nunca te pide pegar un secreto:
   si algo necesita una credencial, pide el nombre de la variable de entorno.
2. **Definir para quién es y qué decir.** Define audiencias, mensaje y tono, pregunta en qué
   idiomas lo querés, y registra lo que decidiste.
3. **Planificar y priorizar.** Una estratega propone un conjunto de piezas, las ordena y explica
   por qué, citando tu propio material. Trata las "recetas" de marketing como hipótesis con
   fuentes, nunca como promesas de resultados.
4. **Crear.** Una dirección creativa propone varios ganchos y elige uno. Los guiones se escriben
   escena por escena. Una dirección de motion decide cómo se mueve cada escena y por qué, y un
   productor de assets lista qué prueba necesita cada escena y avisa lo que todavía no existe en
   lugar de inventarlo.
5. **Revisar como adversario.** Un crítico editorial independiente lee el guion y el preview y
   puede decir "cambios requeridos". Quien escribió lo corrige y se revisa de nuevo.
6. **Renderizar y verificar.** Se generan previews y video, se comprueban las exportaciones y un
   control de calidad independiente mira el resultado.
7. **Preparar, nunca publicar.** Studio arma paquetes por canal y una cola de "publicá esto
   primero", y mantiene un dashboard local con avance e historial. Publicás vos y le contás
   dónde.

El trabajo lo hacen cinco agentes especialistas: estratega de contenido, dirección creativa,
dirección de motion, productor de assets y crítico editorial. Quien escribe una pieza nunca la
aprueba.

## Por qué podés confiar en el resultado

Es la misma idea de Keelokit: una regla importante tiene que apuntar a algo que la compruebe, no
solo a un prompt.

- Cada paso produce un archivo estructurado guardado en tu proyecto, y un script lo valida antes
  del paso siguiente.
- Una afirmación en un video tiene que estar respaldada por evidencia capturada de tu producto.
  Si falta la evidencia, la escena queda bloqueada en lugar de rellenarse con una suposición.
- Tus aprobaciones quedan atadas a la versión exacta de lo que aprobaste. Si algo cambia, solo se
  reabre el trabajo que dependía de eso.
- "Renderizado" no significa "verificado", y "listo" no significa "publicado". Studio nunca
  publica nada por su cuenta.

## Con qué se integra

- **Claude Code.** Studio es un plugin: un comando, una skill y cinco agentes.
- **Tu repositorio.** Lee tu documentación y material de marca, y escribe todo lo que produce en
  tu proyecto, en `.keelokit/studio/` y `media/studio/`. Nunca escribe dentro de la carpeta del
  plugin.
- **Tu aplicación web en funcionamiento.** Con Playwright puede seguir un recorrido que definas,
  por ejemplo entrar con un rol y completar una tarea, y capturar pantallas como evidencia. Solo
  visita los orígenes que le permitas.
- **Tu app móvil** (React Native, Expo o cualquier build nativa) en un dispositivo o emulador
  Android, o en un simulador de iOS. En Android, Studio puede abrir la app, navegarla, escribir
  datos de demo y confirmar lo que hay en pantalla, así que sus capturas pueden respaldar
  afirmaciones de un guion. En iOS abre la app, sigue deep links y guarda las capturas; como las
  herramientas del simulador no pueden leer la pantalla, esas capturas sirven como material de
  video, no como prueba de una afirmación. Vos levantás el dispositivo e instalás el build antes;
  el `/keelokit:run-local` de Keelokit hace justamente eso.
- **Remotion** para renderizar previews y video MP4.
- **Un proveedor de voz, si querés narración,** como integración opcional. Nunca recibe una clave
  por la conversación, solo el nombre de una variable de entorno.
- **Keelokit,** con el que comparte marketplace. Son independientes; podés usar uno sin el otro.

## Cómo empezar

Necesitás Node 22.16 o superior y Claude Code. Para renderizar imágenes y video también un
Chromium que le indiques a Studio (build headless-shell o Chrome for Testing). Studio nunca
descarga un navegador por su cuenta.

**Desde el zip.** Solo contiene código fuente, así que es igual en cualquier sistema operativo.
Descargá [`keelokit-studio-plugin.zip`](https://github.com/leosimini/keelokit-studio/raw/main/releases/keelokit-studio-plugin.zip)
y corré:

```bash
unzip keelokit-studio-plugin.zip -d keelokit-studio
npm ci --omit=dev --ignore-scripts --prefix keelokit-studio   # una vez; baja los binarios de Remotion para tu máquina
cd /ruta/al/repo/que/querés/explicar
claude --plugin-dir /ruta/a/keelokit-studio
```

Después corré `/keelokit-studio:start`. Si te saltás el `npm ci`, el comando te dice exactamente
qué ejecutar.

**Desde el marketplace de Keelokit,** cuando haya una versión revisada fijada ahí:

```bash
claude plugin marketplace add leosimini/keelokit
claude plugin install keelokit-studio@keelokit
```

**Desde el código,** si querés trabajar en él:

```bash
git clone https://github.com/leosimini/keelokit-studio && cd keelokit-studio
npm ci
npm run verify
claude --plugin-dir "$PWD"
```

## Para tener en cuenta

- **La narración necesita un proveedor de voz que configures vos.** Con uno, el video lleva una
  locución atada al guion aprobado exacto, música con licencia opcional que se atenúa bajo la
  voz, y subtítulos sincronizados con el habla. Sin proveedor, el video es mudo y lo declara.
  Vienen dos proveedores (cualquier servicio con un endpoint de voz estilo OpenAI, y el comando
  `say` de macOS para borradores gratis), pero ninguno se ejecutó contra el servicio real en mis
  pruebas: escuchá una muestra antes de producir una pieza entera. Studio no puede juzgar cómo
  suena una voz ni cómo pronuncia un nombre.
- **La captura móvil es nueva y no pude probarla en hardware real.** Los adaptadores de Android
  e iOS están probados contra simulaciones de `adb` y `xcrun simctl`, no contra un emulador,
  dispositivo o simulador de verdad. Un comando revisa tu configuración en segundos
  (`scripts/studio-capture-native.mjs --capability android --serial <id>`), y una captura fallida
  aparece como fallo, nunca como una afirmación incorrecta. Ver [`docs/native-capture.md`](docs/native-capture.md).
- **Cualquier otra superficie** (apps de escritorio, etc.) no se captura. Podés aportar tus
  propias grabaciones, y Studio las trata como aportadas por vos, no como verificadas.
- **Cada idioma necesita su propia evidencia.** Un video en español se contrasta con capturas
  tomadas con el producto en español; Studio nunca acepta como verificada una afirmación
  traducida. Tampoco puede saber si la fuente que elegiste cubre los caracteres de un idioma:
  revisá cada preview. Detalles en [`docs/localization.md`](docs/localization.md).
- **Remotion tiene sus propios términos comerciales.** Studio es MIT y no los cambia; confirmá que
  tu organización es elegible antes de renderizar.
- **Usa más tokens que un chat común,** porque varios agentes trabajan en cada pieza.
- **Los controles atrapan errores, no manipulación.** Evitan que un agente se salte un paso o
  invente una afirmación. No evitan que alguien edite los archivos a mano. El detalle está en
  [`docs/trust-model.md`](docs/trust-model.md).
- **Qué está verificado:** el plugin carga en Claude Code con su comando, su skill y sus cinco
  agentes, y pasan los tests, el empaquetado y el render. Todavía no corrí una sesión larga y
  completamente autenticada desde la app de escritorio de Claude, así que esperá asperezas ahí.

## Licencia

MIT — ver [LICENSE](LICENSE). Hecho por [Leopoldo Simini](https://leopoldosimini.com/).
