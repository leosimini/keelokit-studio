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
  llamado a la acción, con guion escena por escena: narración, texto en pantalla y tiempos.
- **Tutoriales.** Videos paso a paso que respetan los requisitos previos y el orden en que el
  producto realmente funciona.
- **Guías escritas.** Guías tipo centro de ayuda, construidas con el mismo material verificado
  que los videos, para que nunca se contradigan.
- **Cortes para redes.** Adaptaciones cortas de la misma historia para cada canal y formato.
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
2. **Definir para quién es y qué decir.** Define audiencias, mensaje y tono, y registra lo que
   decidiste.
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

- **Los videos todavía no tienen sonido.** La narración está en el guion y en los subtítulos
  exportados, pero el MP4 no tiene pista de audio. El manifiesto del render lo declara.
- **Solo aplicaciones web.** La captura de apps móviles nativas no está implementada. Para todo lo
  demás podés aportar tus propias grabaciones, y Studio las trata como aportadas por vos, no como
  verificadas.
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
