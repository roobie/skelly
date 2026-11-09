---
read_if:
  - you're new to skelly and want to know what it is
  - you want to play it, or run and check it locally
  - you check the code and shared asset licences
---

# skelly

skelly is a hobby monorepo built around **deadvox**, a voxel survival game that runs in the browser. Its models and creatures come from the pipelines in the shared asset submodule. The point is to have fun.

![skelly](assets/skelly.png)

**Play:** <https://roobie.github.io/skelly/> opens a launcher for the game. The authoring tools and the asset showcase live in skelly-assets, so the launcher links that site rather than hosting them.

## Projects

- **[deadvox](packages/deadvox/PROJECT.md)**: the game. You scavenge a large voxel world full of zombies, with detailed items, bodies and crafting. It runs entirely in the browser, with no server.
- **mods** (`packages/mods`): the shared content mods products build their stacks from; see `docs/decisions/0009-content-defined-products.md`, "Definitions and distribution".
- **[skelly-assets](https://github.com/roobie/skelly-assets)**: the shared models and the pipelines that build them, including the gun, thing and vehicle authoring tools and the creature pipeline, checked out as the `packages/skelly-assets` submodule.
- **[things](things/README.md)**: the design decisions of the thing authoring tools, which live in the submodule.

## Run and check locally

You need Node.js and npm. The projects are npm workspaces of the root package. From the repository root, one command initializes the shared asset submodule and installs the workspaces, the lit-check tool, the pinned Jsonnet compiler and the pinned asset release:

```sh
npm run setup
```

Start the game's dev server:

```sh
npm run dev --prefix packages/deadvox
```

Run the repository-wide checks with `npm run ci` and `npm run test:site`. Each project's `package.json` lists its own checks, and CI runs the workflows under `.github/workflows/`.

## Licence

Game code, pipeline tools and the asset showcase use EUPL-1.2. The shared models and built assets in [skelly-assets](https://github.com/roobie/skelly-assets) use CC-BY-NC-SA-4.0, which restricts commercial use. Keeping the scopes separate shares the tools without relicensing the models; see `REUSE.toml` and `packages/skelly-assets/REUSE.toml`.

Contributing? Start with [AGENTS.md](AGENTS.md), [PILLARS.md](PILLARS.md) and [docs/PROCESS.md](docs/PROCESS.md).
