# Trust model

Studio's state lives in plain files inside the consumer project (`.keelokit/studio/`). Its checks
protect against **mistakes**: an agent that skips a gate, reuses a stale approval, approves its
own work, invents a claim, or renders something that was never reviewed. They do not protect
against someone who can edit those files by hand and recompute the public content hashes.

What is enforced by an executable check:

- Approvals bind to an exact subject scope, version and hash; a changed subject has no approval.
- The plan records the exact brief it was built on; production does not start if the approved
  brief changed afterwards.
- A style approval needs passing editorial reports for every covered piece, and neither the
  reviewer nor the approver may be the piece's author or the editorial reviewer.
- `ready` needs valid render and QA components and a current style approval. A piece's
  components change only through `setPieceComponent`, which records the artifact hash and derives
  the status.
- Exports name the render and storyboard they came from; distribution requires the same pair,
  a passing independent QA report and a current style approval.
- Publication annotations need a date and a ready piece; Studio never publishes.

What is **not** enforced, and why:

- Actor ids (`producer`, `reviewer`, `confirmedBy`) are strings the caller supplies. Separating
  them stops honest role confusion, not impersonation. A real identity needs a signing identity
  outside the project, which Studio does not invent.
- Hash-bound records (handoffs, reviews, QA reports) are self-consistent, not signed.
- The hook filter rejects invented figures and absolutes by pattern. It does not understand
  meaning; the evidence-bound claim check is the real gate for every other line of copy.
- Rendered video has no audio track, so narration reaches viewers as captions only.
