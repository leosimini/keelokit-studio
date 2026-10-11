# Keelokit Studio

**A Claude Code plugin that turns a product repository into a marketing studio you can audit.**

*[keelokit.com](https://keelokit.com) · [Leer en español](README.es.md)*

I build products with coding agents, and the part I kept leaving for last was explaining them:
the video that shows the product working, the tutorial, the guide, the post. When I let an agent
write that, it sounded fine and claimed things nobody had checked. Studio is how I handle it:
my rules, my way of working, shared in case it helps someone who ships software and also has to
tell people about it. I maintain it as a hobby, next to [Keelokit](https://github.com/leosimini/keelokit),
and it is the second plugin of what I hope becomes a small suite of Keelokit plugins, each one
about a different topic.

It is opinionated and young. Take what is useful.

## The idea

It follows the same principle as Keelokit: a rule that matters should point to something that
checks it. Here that means:

- Every step produces a typed file saved in your project, a script validates it, and a different
  agent reviews it before the next step starts: **specialist → saved artifact → mechanical
  check → independent review → next specialist.**
- Whoever writes a piece never approves it. A cited strategist, a creative director, a motion
  director, an asset producer and an adversarial editorial critic each have one job.
- What nobody knows becomes a written gap, not a guess. A claim in a video needs evidence from
  the product; if the evidence is missing, the scene is blocked.
- "Rendered" is not "verified", and "ready" is not "published". Approvals are tied to the exact
  version and hash of what you approved, and a change invalidates only what depends on it.
- Studio prepares publication packages and records, by hand, where you published them. It never
  publishes anything.

## What it does

Run `/keelokit-studio:start` in the project you want to explain. It reads the repo, asks only
what is missing, and then walks through:

| Step | What you get |
|---|---|
| Discover | Sources classified (README, docs, manuals, brand files), with what is stale or absent |
| Interview | Only the unresolved questions; secrets are never requested, only the *name* of an environment variable |
| Audiences and brief | Who you are talking to, the message, tone, and what you decided |
| Strategy and plan | A ranked portfolio of explainers, tutorials, guides and social cuts, each argued from cited evidence and recipes. Recipes are hypotheses with sources, never promises |
| Treatment and script | Competing hooks, one chosen; complete scene scripts with narration, on-screen text, timings and the animation's purpose |
| Assets and motion | The exact proof each scene needs, and what blocks it if it does not exist yet |
| Review | An adversarial critic reads the script and the rendered preview and can say *changes requested* |
| Render and QA | PNG previews and MP4 through Remotion, export checks, independent QA |
| Distribution and dashboard | Channel packages (proposals only), a ranked "publish this first" queue, and a local dashboard with history |

Everything it writes lives in **your** project under `.keelokit/studio/` and `media/studio/`.
Nothing is written into the plugin.

## Try it

You need Node 22.16 or newer and Claude Code. Rendering needs a Chromium you point it to
(a headless-shell or Chrome for Testing build). Studio never downloads a browser on its own.

Once Studio is merged and tagged, it is installed from the Keelokit marketplace:

```bash
claude plugin marketplace add leosimini/keelokit
claude plugin install keelokit-studio@keelokit
```

Before that, or to try a build from source:

```bash
git clone https://github.com/leosimini/keelokit-studio && cd keelokit-studio
npm ci
npm run verify
claude --plugin-dir "$PWD"
```

`scripts/package-plugin.sh` builds a self-contained ZIP in `dist/` (about 93 MB, because it
carries Remotion and Playwright). It is named after the platform it was built on, e.g.
`keelokit-studio-0.1.0-linux-x64.zip`, because the native renderer binaries inside are specific
to that platform. Build it on the machine type you will use it on.

Then, in the repo you want to explain, open Claude Code and run `/keelokit-studio:start`.

## Good to know

- **Remotion** has its own commercial terms. Studio is MIT; Remotion is not relicensed by it.
  Check that your organization is eligible before rendering.
- **Native mobile capture is not implemented.** Web capture with Playwright works; for anything
  else you contribute the material and Studio records it as contributed, not as verified.
- **Voice** and other integrations are optional and only used when you configure them. A voice
  provider never receives a key from the conversation, only an environment-variable name.
- The rendered MP4 has **no audio track** yet. Narration is in the script and the captions, not
  in the sound. The manifest says so.
- Several agents work on each piece, so it uses more tokens than a single chat.
- Studio checks that a claim is backed by evidence you captured. It cannot tell you the claim
  is a good idea, and the checks are only as good as the evidence you give it.
- I have not yet run a full authenticated conversation from the Claude desktop UI. Loading the
  plugin and its command, skill and five agents is verified; a long human-in-the-loop session is not.

## Development

```bash
npm ci
npm run verify   # tests, portability, strict plugin validation, install, load
```

The install test uses an isolated Claude configuration and a temporary consumer repository.
Working rules for contributors, human or agent, are in [`AGENTS.md`](AGENTS.md).

## License

MIT — see [LICENSE](LICENSE). Made by [Leopoldo Simini](https://leopoldosimini.com/).
