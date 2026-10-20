---
read_if:
  - you're deciding whether a URL parameter belongs in a mod, the hash, player options or the query
  - you're asking why a demo, bench world or tutorial is a mod rather than a URL preset
  - you're asking why developer view state stays out of save identity
tags: [deadvox, adr, mods, url, debug, testing]
---

# 6. URL switches become mods and hash state

## Context

The game entry reads a long list of query parameters that mix four concerns: preparing a world, preparing the player, changing what the developer sees, and driving test harnesses. Each preset is TypeScript that reads its own parameter, so a new demo needs code, and none of it is content a mod could provide. See `packages/deadvox/src/game/config.ts`, `configFromUrl`. The bench reads its own run parameters and world setup on the same entry; see `packages/deadvox/src/bench/run.ts`, `benchRunFromUrl`.

Mods can already replace definitions and are recorded in save identity, but a mod cannot state how a new game starts, and the starting kit is code; see `packages/deadvox/src/game/loadout.ts`, `startingLoadout`.

The project owes no backwards compatibility; see `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".

## Decision

Everything that sets up a world or a player comes from mods, and the URL only names which extra mods to load. Ad hoc developer state lives in one object in the URL hash. Player choices live in player options. The query keeps only the mod list and harness switches. Each home answers one question:

- **Query:** what content this page loads, and which harness drives it. Changing it means a different world, so it needs a reload.
- **Mods:** what the world and the player start as. Content, so it validates, hashes into save identity and can be authored without code.
- **Hash:** what the developer is looking at and poking. Never part of save identity.
- **Player options:** how the player prefers to play and render. Persisted per browser, never in a shared link.

Every caller follows the same homes, the bench and the tutorial included, so no harness keeps a private URL format that a later change has to work around. A prepared game then has one way to start, whether it is a demo, a bench world or the tutorial.

Which packs load and in what order is the pack layering's concern, not this decision's; see `packages/deadvox/docs/pack-split.md`, "Core is the default first pack, not a required one".

The design plan and its slices are in `packages/deadvox/docs/url-mods.md`.

## Reasons for the details

- **A URL names only bundled mods.** Every mod a link can name is reviewed, bundled content, so links raise no remote-fetch, CORS or trust questions. Arbitrary files go through the mods panel.
- **The start state is content.** A new demo is then a content file, not code, and the kit follows the same validation and save identity as every other definition. Placement errors stop startup rather than dropping an item silently, because a demo that quietly starts without its kit tests the wrong thing.
- **Hands are named by role, not side.** A kit then follows the player's handedness option, and a left-handed player never has to swap.
- **The hash overrides the seed.** Exploring other worlds under the same demo stays a hash edit rather than a new mod.
- **The hash is relaxed JSON.** It stays readable and editable in the address bar, where strict JSON would turn every quote into `%22`.
- **View state is written back without history entries.** A copied link still reproduces what the reporter saw, while moving the camera or a slider never floods the back button. A fixed key order keeps links stable and diffable.
- **Unknown query parameters stop startup.** A stale bookmark or test URL then fails instead of silently testing the wrong world, which matters without legacy support.
- **Start state comes first.** A demo proves the mod path before anything else moves onto it.

## Consequences

A demo is a content file and a link, with no new code, and the same file serves a CI script, a playtest, a bench run and a bug report. Demo worlds get their own save identity, so they never overwrite a normal world. Developer view state can change without touching content identity.

The start section is a new content contract that every future spawn feature must go through, and kit placement errors surface only at new-game time, not at validation. Shared links lose player options by design: a link that needs a graphics setting must name a mod.

The bench loses its private URL format: a bench link names demo mods and a hash like any other link, and a bench world is authored as content rather than read from a parameter.
