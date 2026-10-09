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

Code owns what and how; docs preserve why and, when useful, the trigger. Issues and PRs show what and how too, but they end, so code is the lasting record. This keeps tracked explanations from duplicating implementation or accumulating obsolete history. Cue code by path and symbol, replace superseded text instead of appending amendments, and keep the settled reason in a tracked doc. Design docs may state intent before implementation; implementation trims them to the reason and code cues.

Reviews that find an amendment trail return FIX. Obsolete or superseded ADRs are deleted, and reviews and retros live only in git history, never as current records in the working tree. Apply it continuously, as each change trims the docs it touches, and periodically, with a deep docs pass once when closing each slice.

## Run and check

Install the dependencies for repository-wide checks with `npm run setup`. Jsonnet compilation also requires Go; the minimum is declared by `tools/jsonnet/go.mod`, and CI's `.github/workflows/lint.yml`, `setup-go`, supplies its selected toolchain.

```sh
npm run setup
```

Run a subproject's dev server from the repository root:

```sh
npm run dev --prefix gungen
npm run dev --prefix deadvox
npm run dev --prefix mobgen
```

The root checks are `npm run ci` and `npm run test:site`. Subproject checks are listed in [`docs/PROCESS.md`](docs/PROCESS.md).
