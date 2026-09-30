# How work gets done in skelly

The working process, kept tight: what's done, how a change moves, and the rules that came out
of things going wrong. It grows by one line when a mistake repeats, and it shrinks when a rule
stops earning its place. The code-quality pillars are in `README.md`, and agent setup is in
`AGENTS.md`. This file doesn't repeat them.

## Who decides

- **BR** owns the project: rules on design, judges by eye, ear and feel, and merges.
- **The lead** (a Claude Code session) writes specs, dispatches work, checks reports against the
  spec, relays BR's verdicts, opens PRs and watches CI. It never merges or decides for BR.
- **Coders** build one item at a time. The **code reviewer** reviews their commits and advises
  the lead.

The agents work over agent mail. Their roles and protocol are in agent-kit's
`skills/agent-mail/TEAM.md` and `PROTOCOL.md`.

## The life of a change

1. **Spec:** one item, self-contained. Its proof uses absolute bounds (mm, degrees, ms), never
   bounds derived from the tuning under test.
2. **Branch:** `<subproject>/<topic>` from `origin/main`, in a worktree under
   `.claude/worktrees/` (`AGENTS.md`). Never commit to `main`.
3. **Build and prove:** every new test is shown failing before the fix. A report names the pushed
   commit and says whether the worktree is clean.
4. **Spec check, then code review:** the lead checks the report against the spec, then has the
   code reviewer review the commit. The lead forwards the must-fix and should-fix findings it
   accepts.
5. **BR's verdict:** anything judged by eye, ear or feel waits for BR (below). This runs in
   parallel with the code review.
6. **PR:** the lead opens it with a description that stands on its own and watches CI. BR merges.
7. **Clean up after the merge:** remove the worktree, stop its dev server, and delete the remote
   branch.

## Done, per subproject

A change is done when its subproject's CI checks pass locally, the root checks pass, and BR has
approved anything visual.

| Where | Checks (run as CI does) |
|---|---|
| Root, every change | `npm run ci` and `npm run test:site`; the pre-push hook runs both |
| gungen | `typecheck`, `test` (sweeps run under `CI` or `GUNGEN_SWEEPS=1`: run `test:sweeps` locally), `validate`, `check:designs`, `vite build`. Regenerate deadvox's exported models when the export changes |
| deadvox | `lint:lit`, `typecheck`, `test`, `test:ui-browser` (with `CHROME_BIN`), `test:browser:firefox` (under xvfb), `validate`, `vite build`, and the simulation fingerprint when simulation code changes |
| mobgen | `typecheck`, `test`, `vite build` |

## Reviews by eye and by play

- **Links use the LAN IP** (`http://192.168.9.38:<port>/…`), and dev servers are bound with
  `--host`. BR reviews from another machine.
- **gungen:** give a link per design with a `camera=` view (side, rear, rear-¾), from a stable
  review server pinned to the reviewed commit, not a coder's live worktree.
- **deadvox:** `?seed=<n>&debug=1`. Anything that saves needs HTTPS: through caddy on `:8443`.
- **Relay what BR said, in BR's words.** A verdict on one item never counts for another.

## Recording decisions

- **Small rulings** go inline, where the thing is specified: "Decided (BR, YYYY-MM-DD): …" in the
  subproject's `PROJECT.md`, `DESIGN.md` or `SLICE-*.md`.
- **Cross-cutting or format-defining decisions** get an ADR in `<subproject>/docs/decisions/`
  (e.g. deadvox 0002, saves).
- **Mail and chat are transport, not the record.** A ruling that only exists in a thread isn't
  recorded.

## Working rules

- **Bound every run:** Vitest and tool timeouts are in milliseconds, and long runs are wrapped in
  `timeout 300`. A run with no bound once hung for three hours.
- **Units:** gungen uses 11.5 mm per u; deadvox and mobgen use metres and seconds.
- **Determinism:** seeded RNG only; no `Math.random` in simulation or generators.
- **Don't loosen a test to make room for a change.** Pin the new measured value as a documented
  expectation, so the next change to it is noticed.

## When main is red

Fixing it comes first: the smallest possible PR, with nothing else in it (e.g. #98). Work
already in flight can carry the same fix to get past its own checks, and it merges cleanly
once the fix lands.
