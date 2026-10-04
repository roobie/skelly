---
read_if:
  - you're new to the repository and want its subprojects and pillars
  - you're about to make a trade-off between churn and maintainability
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
- **CI enforces it:** `.github/workflows/lint.yml` runs `biome ci` on every push
  and PR, and the Pages deploy won't publish unless lint, types and tests pass.
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

If a code change can make a doc sentence false without anyone touching the doc, that
sentence is in the wrong place. Say it in code (a name, a type, a test) and point to it
from the doc.

- **Point, don't restate.** Cue code by path and symbol, for example "see
  `deadvox/src/core/options.ts`, `dropTarget`". Never cite a line number, and never copy
  or generate a list, table or value from code into a doc.
- **A "when" names its trigger.** "Until `<item>`" or "after #`<pr>`" can be checked; "today",
  "currently" and "newly" can't. The PR that completes an item resolves every doc line
  that names it.
- **The final reason lives in the repo.** Reasoning in a PR, review, issue or commit
  message that still matters after the merge goes into a tracked doc or ADR before the
  merge. PRs and issues keep the history for archaeology; commit messages aren't a home
  for the final reason.
- **Comments say why, and only when there's a special why.** Most code needs none.
- **Design docs may state intent ahead of the code.** The PR that builds it trims the
  doc to the why and cues the code.
- **ADRs:** the context is a dated snapshot. The decision and its consequences stay
  true, amended by dated rulings or superseded by a new ADR. Specification belongs in
  code, cued from the ADR.
- **Reviews and retros are dated snapshots,** true as of their date, and exempt.
- **A slice plan leaves the tree at its retrospective, after its live content moves.**
  Git and GitHub history keep it (BR, 2026-10-04 21:49: "actually, recall on slice-1
  directive / let's archive it as soon as possible (which would have been at the
  retrospective), so next best would be now").
- **Every doc says why you'd read it.** Its front matter carries `read_if`, a list of
  reasons, each finishing the sentence "Read this if …" (BR, 2026-10-04: "it shall note
  all up front reasons for readin[g] the document"):

  ```yaml
  ---
  read_if:
    - you change how saves are stored, versioned or loaded
    - you add state that must survive a reload
  ---
  ```

A false doc is a defect, and a review returns FIX for it. Until r27 lands, reviews check
these rules by hand; r27 adds a CI check that every cited path and symbol exists, that no
doc outside reviews and retros cites a line number, and that every doc has `read_if`.

## Shared direction

Subprojects should share the domain-agnostic parts: connection points (ports),
constraints, keep-out volumes, the assembly graph and seeded determinism.
Domain-specific knowledge (gun parts, bones, furniture…) lives in data, not in
the core. The skeleton-rigging roots fit this model: a joint is a port with
degrees of freedom.
