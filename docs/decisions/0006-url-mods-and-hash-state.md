---
read_if:
  - you're deciding whether a URL parameter belongs in a mod, the hash, player options or the query
  - you're asking why a demo, bench world or tutorial is a mod rather than a URL preset
  - you're asking why a link names its start with one `start-mod` parameter
  - you're asking why developer view state stays out of save identity
  - you distinguish bundled URL selectors from remote mod intake or tool handoff
  - you connect a product entry pack to scenario-owned starts
  - you change ownership of normal starts or debug kit composition
tags: [deadvox, adr, mods, url, debug, testing]
---

# 6. URL switches become mods and hash state

## Context

World preparation, player setup, developer view state and test harness control need distinct owners so a new demo does not require another private runtime preset. Normal player setup is admitted start content; see `packages/engine/src/core/startState.ts`, `applyStartState`. Debug kits use a normal start plus the spawn menu or a mod-owned row; see `docs/decisions/0009-content-defined-products.md`, "Starts and mixing". The query-to-hash migration on PR #1539 must use those same ownership boundaries. The bench reads its run settings through the same page reader and homes; see `packages/deadvox/src/bench/run.ts`, `benchRunFromUrl`.

The project owes no backwards compatibility; see `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".

## Decision

Everything that sets up a world or a player comes from mods, and the URL only names which mods to load. Ad hoc developer state lives in one object in the URL hash. Player choices live in player options. The query keeps only the mod list, the start mod and harness switches. Each home answers one question:

- **Query:** what content this page loads, where its run starts, and which harness drives it. Changing it means a different world, so it needs a reload.
- **Mods:** what the world and the player start as. Content, so it validates, hashes into save identity and can be authored without code.
- **Hash:** what the developer is looking at and poking. Never part of save identity.
- **Player options:** how the player prefers to play and render. Persisted per browser, never in a shared link.

Every caller follows the same homes, the bench and the tutorial included, so no harness keeps a private URL format that a later change has to work around. A prepared game then has one way to start, whether it is a demo, a bench world or the tutorial.

A link names its start with one query parameter, `start-mod`, whose value is a mod id or inline mod data that supplies exactly one start row; see `packages/engine/src/game/bundledMods.ts`, `startModFromUrl`. The inline form lets a test or link that needs its own starting point and gear keep that start config beside itself, instead of setting one parameter per field or depending on a row authored elsewhere. One parameter takes both forms, so a link cannot name its start two ways. Committed scenarios, the tutorial among them, are real mods a link picks through `?mods=`, as it picks any other mod. The run starts from the start mod's row, else the default start of the last admitted pack that names one, so a scenario picked through `?mods=` wins, else the product default; see `packages/engine/src/game/startSelection.ts`, `runStartId`.

Settings without a home are not supported. One that is needed comes back as a mod, not a query parameter, so the query does not keep a second, untested path for state that content or the hash should own. Each parameter's home is in `packages/deadvox/docs/url-mods.md`, "Where each parameter goes".

The product entry pack declares its stack and selects its default scenario and start. Start rows belong to scenarios, which may offer several starts; see `docs/decisions/0009-content-defined-products.md`, "Starts and mixing". Pack dependency admission, not URL parsing, owns the composition rules.

The design plan and its slices are in `packages/deadvox/docs/url-mods.md`.

## Reasons for the details

- **The bundled-id selector names only bundled mods.** It selects reviewed content without remote fetching. Arbitrary sources go through mod intake, not that selector. HTTPS, CORS, source confirmation and own-origin file access follow `docs/decisions/0009-content-defined-products.md`, "Remote intake". The tool's hosted-workspace handoff still needs a transport under `docs/decisions/0008-mod-authoring-tool.md`, "Testing, sharing and start flow".
- **The start state is content.** A new demo is then a content file, not code, and the kit follows the same validation and save identity as every other definition. Placement errors stop startup rather than dropping an item silently, because a demo that quietly starts without its kit tests the wrong thing.
- **Hands are named by role, not side.** A kit then follows the player's handedness option, and a left-handed player never has to swap.
- **The hash overrides the seed.** Exploring other worlds under the same demo stays a hash edit rather than a new mod.
- **The hash is relaxed JSON.** It stays readable and editable in the address bar, where strict JSON would turn every quote into `%22`.
- **View state is written back without history entries.** A copied link still reproduces what the reporter saw, while moving the camera or a slider never floods the back button. A fixed key order keeps links stable and diffable.
- **Unknown query parameters stop startup.** A stale bookmark or test URL then fails instead of silently testing the wrong world, which matters without legacy support.
- **Start state comes first.** A demo proves the mod path before anything else moves onto it.

## Consequences

A demo is a content file and a link, with no new code, and the same file serves a CI script, a playtest, a bench run and a bug report. Demo worlds get their own save identity, so they never overwrite a normal world. Developer view state can change without touching content identity.

Every spawn feature must use the start content contract. Admission rejects unresolved references and invalid parent pockets or slots; ordinary inventory placement still owns physical fit at new-game time. Shared links lose player options by design: a link that needs a graphics setting must name a mod.

The bench loses its private URL format: a bench link names its mods, its start mod and a hash like any other link, and a bench world is authored as content rather than read from a parameter.
