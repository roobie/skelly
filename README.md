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

Strict TypeScript, Biome and Knip checks catch errors early. TypeScript settings live in each subproject's `tsconfig.json`; repository-wide lint and dead-code checks are configured in [`biome.jsonc`](biome.jsonc) and [`knip.jsonc`](knip.jsonc).

### Maintainability

Prefer a maintainable design over minimizing short-term churn, unless the churn is too costly. Record the reason for trade-offs.

### Zero drift

BR, 2026-10-04: "Code shows what and how (and github can show this too - but the lifecycle of an issue or PR terminates) / Docs describe why and when"

BR, 2026-10-07 17:05:55 +02:00:

> specifically, we shall trim all the fat that is 'what' and 'how' and only keep 'why' and when needed 'when'
> docs are _not_ for historical followup nor a place for accumulating amendments
>
> this is already a core pillar, but we must execute it incrementally, continuously and periodically

Docs explain why and name a trigger only when it matters; code owns what and how. Cue code by path and symbol, replace superseded text instead of appending amendments, and keep the final reason in a tracked doc. Design docs may state intent before implementation, but the implementing change trims them to the reason and code cues.

A review that finds an amendment trail returns FIX, not a nit. BR, 2026-10-07 20:27:13 +02:00: "FIX".

Superseded ADRs, reviews and retros belong in git history, not as current records in the working tree. BR, 2026-10-07 22:51:19 +02:00: "obsoleted or superseded ADRs are deleted, confined to git history. We should make reviews and retros too live in historical layers only - not in-repo as current records."

The deep docs pass runs once per slice during closure. BR, 2026-10-07 20:27:13 +02:00: "Once per slice, in the process of closing it".

## Run and check

Install the dependencies for repository-wide checks:

```sh
npm ci
npm ci --prefix gungen
npm ci --prefix deadvox
npm ci --prefix mobgen
npm ci --prefix deadvox/tools/lit-check
```

Run a subproject's dev server from the repository root:

```sh
npm run dev --prefix gungen
npm run dev --prefix deadvox
npm run dev --prefix mobgen
```

The root checks are `npm run ci` and `npm run test:site`. Subproject checks are listed in [`docs/PROCESS.md`](docs/PROCESS.md).
