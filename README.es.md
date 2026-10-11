# Keelokit Studio

**Un plugin de Claude Code que convierte el repositorio de un producto en un estudio de marketing auditable.**

*[keelokit.com](https://keelokit.com) · [Read in English](README.md)*

Construyo productos con agentes de código, y lo que siempre dejaba para el final era explicarlos:
el video que muestra el producto funcionando, el tutorial, la guía, el post. Cuando dejaba que un
agente lo escribiera, sonaba bien y afirmaba cosas que nadie había comprobado. Studio es cómo lo
resuelvo yo: mis reglas, mi forma de trabajar, compartidas por si le sirven a alguien que
publica software y además tiene que contarlo. Lo mantengo como hobby, junto a
[Keelokit](https://github.com/leosimini/keelokit), y es el segundo plugin de lo que espero que
sea una pequeña suite de plugins Keelokit, cada uno sobre un tema distinto.

Es opinionado y joven. Quedate con lo que te sirva.

## La idea

Sigue el mismo principio que Keelokit: una regla importante tiene que apuntar a algo que la
compruebe.

- Cada paso produce un archivo tipado guardado en tu proyecto, un script lo valida y otro agente
  lo revisa antes del paso siguiente: **especialista → artefacto guardado → chequeo mecánico →
  revisión independiente → siguiente especialista.**
- Quien escribe una pieza nunca la aprueba. Una estratega con citas, una dirección creativa,
  una dirección de motion, un productor de assets y un crítico editorial adversarial tienen un
  solo trabajo cada uno.
- Lo que nadie sabe queda como vacío escrito, no como invento. Una afirmación en un video necesita
  evidencia del producto; si falta, la escena queda bloqueada.
- "Renderizado" no es "verificado", y "listo" no es "publicado". Las aprobaciones quedan atadas a
  la versión y al hash exactos, y un cambio invalida solo lo que depende de él.
- Studio prepara paquetes de publicación y registra, a mano, dónde publicaste. Nunca publica nada.

## Qué hace

Corré `/keelokit-studio:start` en el proyecto que querés explicar. Lee el repo, pregunta solo lo
que falta y recorre: descubrimiento, entrevista, audiencias y brief, estrategia y plan
(explainers, tutoriales, guías y cortes sociales, rankeados con evidencia citada), tratamiento
creativo con ganchos en competencia, guiones completos escena por escena, requisitos exactos de
assets y motion, revisión adversarial, render PNG/MP4 con Remotion, QA, paquetes de distribución
(solo propuestas), cola "qué publicar primero" y un dashboard local con historial.

Todo lo que escribe queda en **tu** proyecto, en `.keelokit/studio/` y `media/studio/`.
Nada se escribe dentro del plugin.

## Probalo

Necesitás Node 22.16 o superior y Claude Code. Para renderizar, un Chromium que le indiques
(build headless-shell o Chrome for Testing). Studio nunca descarga un navegador por su cuenta.

**Desde el zip** (cualquier plataforma; solo lleva fuentes, como el de Keelokit). Descargá
[`keelokit-studio-plugin.zip`](https://github.com/leosimini/keelokit-studio/raw/main/releases/keelokit-studio-plugin.zip) y:

```bash
unzip keelokit-studio-plugin.zip -d keelokit-studio
npm ci --omit=dev --ignore-scripts --prefix keelokit-studio   # una vez; baja los binarios de Remotion para tu máquina
cd /ruta/al/repo/que/querés/explicar
claude --plugin-dir /ruta/a/keelokit-studio
```

Después corré `/keelokit-studio:start`. Si te saltás el `npm ci`, el comando te dice qué correr.

**Desde el marketplace de Keelokit**, cuando haya una versión revisada fijada ahí:

```bash
claude plugin marketplace add leosimini/keelokit
claude plugin install keelokit-studio@keelokit
```

**Desde el código**, para trabajar en él:

```bash
git clone https://github.com/leosimini/keelokit-studio && cd keelokit-studio
npm ci
npm run verify
claude --plugin-dir "$PWD"
```

## Para tener en cuenta

- **Remotion** tiene términos comerciales propios; Studio es MIT y no relicencia Remotion.
- **La captura móvil nativa no está implementada.** La captura web con Playwright funciona; para
  lo demás aportás el material y Studio lo registra como aportado, no como verificado.
- **Voz** y otras integraciones son opcionales; nunca reciben una clave desde la conversación,
  solo el nombre de una variable de entorno.
- El MP4 renderizado **todavía no tiene pista de audio**. La narración está en el guion y en los
  subtítulos, no en el sonido. El manifiesto lo declara.
- Todavía no corrí una conversación completa autenticada desde la interfaz de Claude. Está
  verificado que el plugin carga con su comando, su skill y sus cinco agentes.

## Licencia

MIT — ver [LICENSE](LICENSE). Hecho por [Leopoldo Simini](https://leopoldosimini.com/).
