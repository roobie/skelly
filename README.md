---
read_if:
  - you're choosing a project or need to run or check it
  - you're changing the repository's engineering or documentation principles
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

### Zero drift

A doc sentence that a code change can make false, without anyone touching the doc, will eventually be false, and readers (people and agents) act on it. So code owns what and how, where tests and types keep it true, and docs hold only what code can't show: why, and when.

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
