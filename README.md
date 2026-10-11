# Keelokit Studio

**Turn a finished product into explainers, demos, tutorials and guides, straight from its own repository.**

*[keelokit.com](https://keelokit.com) · [Leer en español](README.es.md)*

You have built something. It works. Now you need people to understand it: a short video that
shows what it does, a walkthrough for new users, a help-center guide, a few posts. That work
usually waits until the end, and when you hand it to an AI it tends to sound polished while
claiming things nobody has checked.

Keelokit Studio is a Claude Code plugin that does this job from inside your project. It reads
your repository and your docs, asks you only what it cannot find out, and then works like a
small marketing agency: it decides what is worth making and in what order, writes complete
scene-by-scene scripts, specifies the exact screenshots or recordings each scene needs, and
renders previews and video. Every claim it makes in a script has to point to something real in
your product, and nothing goes out without you looking at it.

I build with coding agents and maintain this as a hobby, next to
[Keelokit](https://github.com/leosimini/keelokit), the harness I use to build the products
themselves. Studio is its sibling: Keelokit helps you build the thing, Studio helps you explain
it. It is opinionated and young, so take what is useful.

## What you can make with it

- **Explainer and product demo videos.** A promise, a walkthrough of the real product and a call
  to action, scripted scene by scene with narration, on-screen text and timing.
- **Tutorials.** Step-by-step videos that keep the prerequisites and the steps in the order your
  product actually requires.
- **Written guides.** Help-center style guides built from the same verified material as the
  videos, so the two never disagree.
- **Social cuts.** Short adaptations of the same story for each channel and format you choose.
- **Every language you need.** Tell Studio which languages you want and each piece is produced
  in each one as its own version, with its own script, captions, evidence and review, rendered
  from the same video design.
- **Production material a person can use.** Scripts as Markdown, the exact list of screenshots
  and recordings each scene needs, captions in WebVTT and SRT, PNG previews, an MP4 render, and
  channel packages ready for you to publish by hand.
- **A plan, not just a pile of files.** A ranked list of what to produce and what to publish
  first, with the reasons and the sources behind each choice.

## How it works

You open Claude Code in the repository you want to explain and run `/keelokit-studio:start`.
From there Studio walks through the same sequence a good agency would:

1. **Understand the product.** It reads your README, docs, manuals and brand files and tells you
   what is missing or out of date. It asks questions only about the gaps, and it never asks you
   to paste a secret; if something needs a credential, it asks for the name of the environment
   variable.
2. **Decide who it is for and what to say.** It defines the audiences, the message and the tone,
   and asks which languages you want, then records what you decided.
3. **Plan and prioritize.** A strategist proposes a set of pieces, ranks them, and explains why,
   citing your own material. It treats marketing "recipes" as hypotheses with sources, never as
   promises of results.
4. **Create.** A creative director proposes several hooks and picks one. Scripts are written scene
   by scene. A motion director decides how each scene moves and why, and an asset producer lists
   exactly what proof each scene needs, and flags what does not exist yet instead of faking it.
5. **Review it as an adversary.** A separate editorial critic reads the script and the preview
   and is allowed to say "changes requested". The author fixes it and it gets reviewed again.
6. **Render and check.** Previews and video are rendered, exports are checked, and an independent
   QA pass looks at the result.
7. **Prepare, never publish.** Studio assembles channel packages and a "publish this first"
   queue, and keeps a local dashboard with progress and history. You publish, and you tell
   Studio where.

Five specialist agents do this work: a content strategist, a creative director, a motion
director, an asset producer and the editorial critic. The agent that writes a piece never
approves it.

## Why you can trust the output

The same idea behind Keelokit applies here: a rule that matters should point to something that
checks it, not just to a prompt.

- Every step produces a structured file saved in your project, and a script validates it before
  the next step starts.
- A claim in a video must be backed by evidence captured from your product. If the evidence is
  missing, the scene is blocked rather than filled with a guess.
- Your approvals are tied to the exact version of what you approved. If something changes, only
  the work that depended on it is reopened.
- "Rendered" does not mean "verified", and "ready" does not mean "published". Studio never
  publishes anything on its own.

## What it works with

- **Claude Code.** Studio is a plugin: one command, one skill and five agents.
- **Your repository.** It reads your docs and brand material and writes everything it produces
  into your project, under `.keelokit/studio/` and `media/studio/`. It never writes into the
  plugin's own folder.
- **Your running web app.** Using Playwright it can follow a journey you define, such as logging
  in as a given role and completing a task, and capture screenshots as evidence. It only visits
  the origins you allow.
- **Your mobile app** (React Native, Expo or any native build) on an Android device or emulator,
  or an iOS simulator. On Android, Studio can open the app, tap through it, type demo data and
  confirm what is on screen, so its captures can back claims in a script. On iOS it launches the
  app, follows deep links and keeps the screenshots; because the simulator tools cannot read the
  screen, those captures are used as footage, not as proof of a claim. You start the device and
  install the build first; Keelokit's `/keelokit:run-local` does exactly that.
- **Remotion** to render previews and MP4 video.
- **A voice provider, if you want narration,** as an optional integration. It never receives a
  key through the conversation, only the name of an environment variable.
- **Keelokit,** which it shares a marketplace with. They are independent; you can use either one
  alone.

## Getting started

You need Node 22.16 or newer and Claude Code. To render images and video you also need a
Chromium you point Studio to (a headless-shell or Chrome for Testing build). Studio never
downloads a browser by itself.

**From the zip.** It contains only source, so it is the same on every operating system.
Download [`keelokit-studio-plugin.zip`](https://github.com/leosimini/keelokit-studio/raw/main/releases/keelokit-studio-plugin.zip)
and run:

```bash
unzip keelokit-studio-plugin.zip -d keelokit-studio
npm ci --omit=dev --ignore-scripts --prefix keelokit-studio   # once; fetches Remotion's binaries for your machine
cd /path/to/the/repo/you/want/to/explain
claude --plugin-dir /path/to/keelokit-studio
```

Then run `/keelokit-studio:start`. If you skip the `npm ci` step, the command tells you exactly
what to run.

**From the Keelokit marketplace,** once a reviewed version is pinned there:

```bash
claude plugin marketplace add leosimini/keelokit
claude plugin install keelokit-studio@keelokit
```

**From source,** if you want to work on it:

```bash
git clone https://github.com/leosimini/keelokit-studio && cd keelokit-studio
npm ci
npm run verify
claude --plugin-dir "$PWD"
```

## Good to know

- **Videos have no sound yet.** Narration lives in the script and in exported captions, but the
  MP4 has no audio track. The render manifest says so explicitly.
- **Mobile capture is new and I could not test it on real hardware.** The Android and iOS
  adapters are tested against stand-ins for `adb` and `xcrun simctl`, not against a real
  emulator, device or simulator. A command checks your setup in seconds
  (`scripts/studio-capture-native.mjs --capability android --serial <id>`), and a failed capture
  shows up as a failure, never as a wrong claim. See [`docs/native-capture.md`](docs/native-capture.md).
- **Anything else** (desktop apps, other surfaces) is not captured. You can contribute your own
  recordings, and Studio treats them as supplied by you, not as verified.
- **Each language needs its own evidence.** A Spanish video is checked against captures taken
  with the product in Spanish; Studio never accepts a translated claim as verified. It also
  cannot tell whether your chosen font covers a language's characters, so check each preview.
  Details in [`docs/localization.md`](docs/localization.md).
- **Remotion has its own commercial terms.** Studio is MIT-licensed and does not change that;
  check that your organization is eligible before rendering.
- **It uses more tokens than a single chat,** because several agents work on each piece.
- **The checks catch mistakes, not tampering.** They stop an agent from skipping a step or
  inventing a claim. They do not stop someone from editing the files by hand. The details are in
  [`docs/trust-model.md`](docs/trust-model.md).
- **What is verified:** the plugin loads in Claude Code with its command, skill and five agents,
  and the test suite, packaging and rendering pass. I have not yet run a long, fully
  authenticated session from the Claude desktop app, so expect rough edges there.

## Development

```bash
npm ci
npm run verify   # tests, portability, manifest validation, install, load and package checks
```

Working rules for contributors, human or agent, are in [`AGENTS.md`](AGENTS.md).
`scripts/package-plugin.sh` rebuilds `releases/keelokit-studio-plugin.zip`, and `npm run verify`
fails if the committed zip no longer matches the sources.

## License

MIT — see [LICENSE](LICENSE). Made by [Leopoldo Simini](https://leopoldosimini.com/).
