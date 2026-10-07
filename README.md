---
read_if:
  - you're new to the repository and want its subprojects and pillars
  - you're about to make a trade-off between churn and maintainability
  - you're changing lint, dead-code checks or their CI gate
  - you're writing or changing a doc, a comment or an ADR (Zero drift)
---

# skelly

A greenfield, experimental, multi-modal 3D project. The scope is not limited to
skeletons, anatomy or rigging. It is a place to try out ideas about generating,
assembling and constraining 3D structure.

**Live site:** <https://roobie.github.io/skelly/>, deployed from `main` by
`.github/workflows/pages.yml`.

## Subprojects

| Dir | Status | Summary |
| --- | --- | --- |
| [`gungen/`](gungen/PROJECT.md) | milestone 2 done: validator, viewer, six archetype templates, seeded generator | A super-low-poly 3D firearm generator that works out how components connect, so every generated assembly fits together. |
| [`deadvox/`](deadvox/PROJECT.md) | scaffold: streamed voxel terrain, meshing worker, walking, block editing, content JSON, HTML inventory | A singleplayer, browser-based voxel survival game in the spirit of DayZ with Cataclysm: DDA-style depth. |
| [`mobgen/`](mobgen/PROJECT.md) | milestone 1 in progress | A procedural generator of mobile actors (zombies, NPCs) for deadvox, built from voxels small enough for a head of about 50. |

How work moves from spec to merge, what "done" means per subproject, and the working rules:
[`docs/PROCESS.md`](docs/PROCESS.md).

## Pillars

### Maximum static analysis, strict formatting

Let tools catch what they can, so review time goes to design. This applies to
every subproject and to all code, tests included.

- **Types:** TypeScript with `strict` plus every extra strictness flag that
  doesn't conflict with the linter (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, …). Checked with
  `npm run typecheck` in each subproject.
- **Lint and format:** [Biome](https://biomejs.dev/), configured once for the
  whole repo in [`biome.jsonc`](biome.jsonc). Every stable rule is on as an
  error. An opt-out needs a written reason next to it in the config, and a
  one-off exception needs a `biome-ignore` comment with a reason.
- **Dead-code analysis:** Knip, configured in `knip.jsonc`; each narrow
  exception carries its reason there (`workspaces.deadvox`). Run `npm run knip`
  from the repository root; `package.json`, `scripts.ci`, and
  `.github/workflows/lint.yml`, `jobs.biome`, gate it. BR, 2026-10-06 06:05
  (r37-1): "We'll start with a one time knip, then re evaluate. Goal is 100%
  clean on knip, and then continually gate on knip". BR, 2026-10-06 07:23:
  "delete The two files Knip still flags" (measurement code:
  `deadvox/src/game/playtestTools.ts`, `SessionMetrics`, `measureSnapshots`).
  The `--production` report stays ungated until BR re-evaluates it after r37-1.
- **CI enforces it:** `.github/workflows/lint.yml`, `jobs.biome`; the Pages
  deploy gate is `.github/workflows/pages.yml`.
- **Run it as CI does:** `npm ci` at the repo root, then `npm run ci` from the
  root (of the worktree, if you're in one). Don't use `npx biome`: without the
  root install it resolves the unrelated npm package `biome`, which checks
  nothing and exits 0. The tool is
  [`@biomejs/biome`](https://www.npmjs.com/package/@biomejs/biome), pinned in
  the root lockfile.
- **Tighten, don't loosen:** when a Biome or TypeScript release adds a check,
  turn it on and fix what it finds. Known debt is marked in place with
  `biome-ignore lint/complexity/noExcessiveCognitiveComplexity`: split those
  functions up when you next change them.

```
npm install        # at the repo root, once
npm run check      # lint + format check
npm run fix        # apply safe fixes and format
```

### The maintainable choice wins; churn is expected

Every subproject is still pre-integration, so reworking what exists is cheap
and debt compounds. When a decision trades short-term churn (regenerated
snapshots, re-reviewed visuals, rewritten tests) against long-term
maintainability (one unit system, one source of truth, no hidden coupling),
take the maintainable option unless the churn is very costly. Record the
choice and why.

Example (BR, 2026-09-29): mobgen face features are sized from the actor's
`height` like the rest of the body, instead of in fixed metres that would have
kept every snapshot unchanged but left two unit systems in one body plan.

### Zero drift

BR, 2026-10-04: "Code shows what and how (and github can show this too - but the
lifecycle of an issue or PR terminates) / Docs describe why and when"

A doc sentence that code can make false belongs in code. Docs keep the reason and
name a trigger only when it matters; cue the rule to its code rather than restating
its what or how. The final reason for a contract belongs in a tracked doc or ADR,
where it remains useful after an issue or PR closes.

BR, 2026-10-07 17:05:55 +02:00:

> specifically, we shall trim all the fat that is 'what' and 'how' and only keep 'why' and when needed 'when'
> docs are _not_ for historical followup nor a place for accumulating amendments
>
> this is already a core pillar, but we must execute it incrementally, continuously and periodically

Design docs may state intent ahead of the code; the PR that builds it trims the doc to the why and cues the code.
Reviews and retros are dated snapshots, true as of their date, and exempt from this pillar, including the no-history rule.
Existing findings stay frozen in `tools/zero-drift-baseline.json` until the docs sweep (#222).

Replace a changed rule with its current form; do not keep the change history in the
doc. Trim incrementally and continuously as you edit, then periodically. `r50` is
the first deep pass, after playtest 1 launches (#181); no recurring interval is set until BR sets one.

## Shared direction

Subprojects should share the domain-agnostic parts: connection points (ports),
constraints, keep-out volumes, the assembly graph and seeded determinism.
Domain-specific knowledge (gun parts, bones, furniture…) lives in data, not in
the core. The skeleton-rigging roots fit this model: a joint is a port with
degrees of freedom.
