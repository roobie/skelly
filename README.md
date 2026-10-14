---
read_if:
  - you're choosing a project or need to run or check it
  - you're changing the repository's engineering or documentation principles
  - you add or change a content mechanism or review its forward compatibility
---

# skelly

A home for small 3D projects and a voxel survival game. The point is to have fun.

**Live site:** <https://roobie.github.io/skelly/>

## Projects

| Project | What it is |
| --- | --- |
| [gungen](gungen/PROJECT.md) | A designer and exporter for feasible low-poly firearms. |
| [deadvox](deadvox/EPIC.md) | A singleplayer, browser-based voxel survival game. |
| [mobgen](mobgen/PROJECT.md) | A procedural generator of voxel mobile actors. |

How work moves from spec to merge, what done means, and the working rules are in [`docs/PROCESS.md`](docs/PROCESS.md).

## Pillars

### Static analysis

Static analysis catches type, style and unused-code defects early; see each subproject's `tsconfig.json`, [`biome.jsonc`](biome.jsonc) and [`knip.jsonc`](knip.jsonc).

### Maintainability

Prefer a maintainable design over minimizing short-term churn, unless the churn is too costly. Record the reason for trade-offs.

### Content forward compatibility

Content holds values; code holds mechanisms, so a new content ID selecting an existing mechanism must work without a code edit. Content entries explicitly select mechanisms and presentation: a block selects a footstep sound, a damage kind a pose, an item a firearm sound. Validation checks selections, not a whitelist of handled content IDs. Missing required metadata and unsupported selections are errors, never silent runtime fallbacks. Use the shared validation boundary; see `deadvox/src/core/content.ts`, `referenceIssues` and `buildRegistry`. Jsonnet authoring defaults are fine when compiled values remain explicit (`docs/jsonnet.md`, "Jsonnet authoring"). Mechanism dispatch tables own selector keys, with no parallel hand-kept list.

Content identity is not a code selector: a new mechanism needs code, a new entry using it does not. Content owns kind-dependent rates, chances, weights and thresholds, including zero; code owns true state impossibilities, physics, geometry and save integrity. Content presentation belongs to content; UI chrome and engine-internal dispatch do not. Apply this rule to added or changed mechanisms across all subprojects, without a sweep or opt-outs; generators without actor modifiers still follow the content, selection and validation requirements.

Actor, body and action values use actor-carried modifiers; see `deadvox/src/core/modifiers.ts`, `modified`. An actor is the source whose effect is being resolved, including an attacking zombie. Apply each modifier once, at the owner resolving the effect; decide subjects, conditions, bounds and persistence with their first consumer rather than building speculative machinery. Tune for the core pack, but never assume a modified value cannot cross a threshold the core numbers do not cross.

### Zero drift

A doc sentence that a code change can make false, without anyone touching the doc, will eventually be false, and readers (people and agents) act on it. So code owns what and how, where tests and types keep it true, and docs hold only what code can't show: why, and when. Issues and PRs show what and how too, but they end, so code is the lasting record.

This keeps tracked explanations from duplicating implementation or accumulating obsolete history. Cue code by path and symbol, replace superseded text instead of appending amendments, and keep the settled reason in a tracked doc. Design docs may state intent before implementation; implementation trims them to the reason and code cues.

Reviews that find an amendment trail return FIX. Obsolete or superseded ADRs are deleted, and reviews and retros live only in git history, never as current records in the working tree. Apply it continuously, as each change trims the docs it touches, and periodically, with a deep docs pass once when closing each slice.

## Run and check

Install repository-wide check dependencies and the pinned Jsonnet compiler with `npm run setup`; the compiler pin lives in `tools/jsonnet/runtime.json`.

Run a subproject's dev server from the repository root:

```sh
npm run dev --prefix gungen
npm run dev --prefix deadvox
npm run dev --prefix mobgen
```

The root checks are `npm run ci` and `npm run test:site`. Use each subproject's `package.json` scripts for its checks; CI runs the workflows under `.github/workflows/`.
