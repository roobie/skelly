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
- **Tighten, don't loosen:** when a Biome or TypeScript release adds a check,
  turn it on and fix what it finds. Known debt is marked in place with
  `biome-ignore lint/complexity/noExcessiveCognitiveComplexity`: split those
  functions up when you next change them.

```
npm install        # at the repo root, once
npm run check      # lint + format check
npm run fix        # apply safe fixes and format
```

## Shared direction

Subprojects should share the domain-agnostic parts: connection points (ports),
constraints, keep-out volumes, the assembly graph and seeded determinism.
Domain-specific knowledge (gun parts, bones, furniture…) lives in data, not in
the core. The skeleton-rigging roots fit this model: a joint is a port with
degrees of freedom.
