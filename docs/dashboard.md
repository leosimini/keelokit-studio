# Persistent dashboard

Run `npm run dashboard -- <consumer-project> [port]` to serve the lightweight dashboard on loopback. Its state is stored in `.keelokit/studio/dashboard.json` with revision checks, so suite progress, blockers, previews, exports, revision history and publication annotations survive later sessions.

Production and publication are separate. Publication is marked per reviewed piece and channel, with optional HTTP(S) URL and date; unmarking clears both values and appends history. The generated HTML also offers a state download and remains viewable as a standalone file, but filesystem persistence requires the local server because isolated browser artifacts cannot write project files.
