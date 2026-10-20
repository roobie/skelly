---
read_if:
  - you add, move or remove a Deadvox game-entry URL parameter or hash key
  - you author a demo mod or change how a URL selects mods
  - you change the mod start-state section, the starting kit or how a new game is set up
  - you change how the camera or other view state is written back to the URL
  - you write a browser test or CI script that opens the game with a prepared URL
  - you change how the bench reads its run parameters or sets up its world
  - you build browser loading of Jsonnet mods
tags: [deadvox, mods, url, debug, testing, design]
---

# URL mods and hash state

This is the design plan for `../../docs/decisions/0006-url-mods-and-hash-state.md`, which holds the decision and its reasons.

## Start state in mods

Add a start-state section to the mod schema, alongside the sections in `src/core/schema.ts`, `SECTION_DESCRIPTOR`. Its row describes a new game: the site layout and its storeys and density, the start time of day, the world seed, the kit, wounds and skill levels. The default row's pack placement follows the start-row question in `pack-split.md`, "Open questions", so its references do not force skill or setting entries into core. `startingLoadout` and the layout's start time move from code into content; see `PILLARS.md`, "Content forward compatibility".

The seed in the start row is optional. A mod pins it when its demo must reproduce one world; otherwise a new game draws one. A hash `seed` overrides it, so exploring other worlds under the same demo stays a hash edit rather than a new mod.

The start row is an ordinary definition. Changing a single field of it from another mod follows `docs/decisions/0007-typed-field-patches.md`, "Decision".

When browser loading of Jsonnet mods is built (issue #801), it must let a browser mod import bundled pack sources, so a browser mod can build on the same sources a demo mod does at build time.

The kit is a list of entries. Each names an item and optionally a count and condition, and says where it goes: worn, in the dominant or off hand, in a pocket of another named entry, or fitted into a slot of another entry. A magazine entry can be filled. Hands are named by role, never by side, so a kit follows the player's handedness option and a left-handed player never has to swap. This is enough to express every kit `src/debug/debugLoadout.ts`, `equipDebugLoadout` builds.

Validation runs at two boundaries:

- **Pack admission** checks references: item, layout, skill and wound ids resolve, named parents exist and come earlier in the list, and no hand is named twice. These join `src/core/content.ts`, `referenceIssues`, so `validate` and the panel report them like any other content issue.
- **New game** places the kit through ordinary inventory adds. A placement the inventory refuses, such as an item too big for its pocket, stops startup with a diagnostic naming the mod and the entry. It never silently drops an item.

Start state applies only to a new game. Continue and replay restore the saved world and ignore it, as they ignore the starting kit.

## Demo mods and URL loading

Demo mods are ordinary mod JSON with a top-level `id`, authored in Jsonnet under a new source root `src/content/demo`, added to `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`, and bundled with the game. They join the TypeScript-derived bundled mods in one id namespace and go through the same intake, `src/game/browserMods.ts`, `evaluateMods`. See `docs/jsonnet.md`, "Source boundaries".

`?mods=` takes a comma-separated list of bundled and demo mod ids, loaded in the order given. It never fetches a file; arbitrary files go through the mods panel. An unknown id stops startup with the usual diagnostics. The mods panel moves to its own `?modpanel` switch.

URL mods and panel mods combine, so a demo can be tried with a player's own mods. Load order is the bundled packs, then URL mods in URL order, then enabled panel mods in panel order. Conflicts between them follow `docs/decisions/0007-typed-field-patches.md`, "Decision". Saves record every admitted pack in that order, through `src/core/saveFormat.ts`, `currentSaveVersionIdentity`. A world started under a demo only resumes with the same mods, the rule `content.md`, "Browser mod identity" sets.

The tutorial is a bundled mod with its own start row, and the game recognises a tutorial run from the loaded start row.

## Hash state

The hash is one object in a relaxed JSON-like form: bare keys, bare word strings, numbers, booleans and arrays, as in `#{cam:[1.5,2,3,90,0],debug:true}`. Strict JSON would turn every quote into `%22` in the address bar. The page parses it once at startup. Its bounds:

- A byte limit in trusted startup configuration under `src/config`, like the browser-mod intake limit, checked before parsing.
- A fixed nesting depth, and keys and value types checked against one schema.
- An unknown key or a value of the wrong type stops startup with a visible error naming the key, as an unknown query parameter does.

Keys are of two kinds. **Start keys** (seed, radius, actors, decals, debug and the bench run keys) apply at page load, and changing them reloads the page. **Live keys** (camera, look switches, weathering tuning, interaction ray) apply on a `hashchange` without reloading.

The page writes back the camera and every live key the debug panel changes, so a copied link still reproduces what the reporter saw. Write-back goes through `history.replaceState` with the throttling and change thresholds the camera already uses, so moving the camera or a slider never adds history entries. Write-back keeps every other key as given and writes keys in a fixed order, so links stay stable and diffable. Restoring the camera keeps the pitch clamp in `src/debug/camUrl.ts`, `parseCamParam`, and ignores roll.

After death, New world keeps the query and the rest of the hash and changes only the hash seed. See `src/ui/death.ts`.

## Where each parameter goes

**To mods (start row or definitions):**

- site, storeys, density, time and seed move into the start row, with the hash seed override in "Start state in mods";
- loadout, wound, firearmsCombat and inventoryManagement become demo mods with kits, wounds and skill levels;
- the debug backpack from `src/debug/debugLoadout.ts`, `equipDebugBackpack`, becomes a `debug-kit` demo mod, so debug no longer changes the world;
- the weathering profile override in `src/core/weatheringUrl.ts`, `resolveWeatheringUrl`, becomes a mod replacing a profile or the site's profile reference;
- the tutorial site becomes the tutorial mod.

**To the hash:** cam, at, seed, debug, radius, actors, decals, the look switches in `LOOK_PARAMS`, the weathering tuning fields in `WEATHERING_URL_PARAMS` other than the profile, interactionray, the voice-size probe's pitches, and the debug render knobs wobbleFlat, wobbleNoiseScale and weatheringSplit.

**To player options:** handedness and the graphics settings in `src/core/graphics.ts`, `GRAPHICS_KNOBS`. Handedness is honoured only under debug in `src/game/config.ts`, `configFromUrl`; as a player option it applies in every game. A test that needs a graphics setting loads a demo mod that replaces the core graphics policy default; see `content.md`, "Graphics policy".

**Staying as harness query switches:** save-backend, save-test, render, bench, skyRoute and debug-error. They choose the harness, not the game.

**Bench mode:** `bench` stays a harness switch and picks which bench runs; everything else the bench reads follows the same homes as the game.

- Its world setup, the site with its storeys and density and the time of day, becomes demo mods that a bench link names through `?mods=`, including the default bench worlds that `src/bench/run.ts`, `benchRunFromUrl` and `src/bench/shamblers.ts`, `shamblerRunFromUrl` fall back to.
- Its run settings, the plan, the run index, quick mode, the shambler counts and the post-processing switch, become hash start keys. The seed is the hash seed override.
- A bench steps to its next run by rewriting the hash and reloading, keeping the query, so each run loads the same mods. See `src/bench/run.ts`, `nextUrl`.

**Out of scope:** the site map and vehicle spike pages keep their own parameters.

The game entry rejects any query parameter other than `mods`, `modpanel` and the harness switches with a visible startup error naming it.

## Browser scripts and CI

Browser scripts stop concatenating query strings. One helper under `test/browser` builds a game URL from a mod list, a hash object and harness switches, so the format lives in one place. Each slice moves every browser script, CI workflow and playtest URL that uses a parameter it moves, so each slice lands green on its own. Among them are `.github/workflows/deadvox-browser.yml`, `tools/publish-playtest.mjs` and `test/site-launcher.test.mjs`. The rejection of unknown parameters lands last and then catches any script a slice missed.

## Slices

Each slice is one PR and leaves every URL that a later slice still owns working. Start state comes first, so the flashlight demo proves the mod path before anything moves onto it. Tests follow `AGENTS.md`, "Tests": the flashlight proof extends an existing flow rather than adding a browser stage.

1. **Start state and URL mod loading.** The start section, its validation and new-game placement; the default row replacing `startingLoadout`; the demo source root; `?mods=` admitting demo mods; `?modpanel`. Every script that opens the panel with `?mods=1`, including `test/browser/firefox-ui.mjs`, moves to `?modpanel`. No other parameter moves. Proof: a flashlight demo mod that starts at night with a flashlight in the dominant hand, tested through a new game.
2. **Hash state.** The parser, bounds and schema; the browser URL helper; the camera, look switches, weathering tuning, interaction ray, debug, radius and the other hash keys moved to the hash, with write-back of the camera and the panel's live keys. The bench run settings move to the hash, with the bench's `nextUrl` functions and the scripts that start a bench. Presets still in the query that are gated on debug read it from the hash. `src/game/tutorial.ts`, `tutorialUrl`, carries radius and actors in the hash instead of clearing it. `test/browser/gauntlet-flow.mjs` and `test/browser/save-storage.mjs` drop route-fixture and save-lock-holder, which nothing in the game reads.
3. **Debug presets to demo mods.** Loadouts, wounds, skill levels, the debug backpack, site, time, storeys, density, seed and the weathering profile leave the query for demo mods, with the playtest publisher and CI workflows that use them. The seed moves into the start row, with its hash override, and New world changes the hash seed. The bench's world setup becomes demo mods. The voice-size probe in `src/game/shamblerAudio.ts` gates on the started layout instead of the site parameter. The tutorial becomes a bundled mod: `src/game/tutorial.ts` detects it from the loaded start row instead of `site=tutorial`, and `tutorialUrl` selects it through `?mods=`.
4. **Player options and rejection.** Handedness and graphics leave the URL. Kept separate because it adds options UI, which slices 1 to 3 do not need. Rejection of unknown query parameters lands here, once every parameter this plan moves has left the query with the scripts that use it.
