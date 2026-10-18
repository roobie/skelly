---
read_if:
  - you add, move or remove a Deadvox game-entry URL parameter or hash key
  - you author a demo mod or change how a URL selects mods
  - you change the mod start-state section, the starting kit or how a new game is set up
  - you change how the camera or other view state is written back to the URL
  - you write a browser test or CI script that opens the game with a prepared URL
  - you change how the bench reads its run parameters or sets up its world
  - you build browser loading of Jsonnet mods
tags: [deadvox, adr, mods, url, debug, testing]
---

# 6. URL switches become mods and hash state

## Context

The game entry reads a long list of query parameters. Some prepare a world (site, time,
storeys, density, weathering), some prepare the player (debug loadouts, wounds, skill
levels), some only change what the developer sees (camera, look switches, weathering
tuning, the interaction ray) and some drive test harnesses. Each preset is TypeScript that
reads its own parameter, so a new demo needs code, and none of it is content a mod could
provide. See `deadvox/src/game/config.ts`, `configFromUrl`,
`deadvox/src/debug/debugLoadout.ts`, `equipDebugLoadout`, and
`deadvox/src/debug/lookUrl.ts`, `parseLookParams`.

The bench runs on the same entry and reads its own run parameters and world setup. See
`deadvox/src/bench/run.ts`, `benchRunFromUrl`, `deadvox/src/bench/shamblers.ts`,
`shamblerRunFromUrl`, and `deadvox/src/bench/post.ts`, `benchPostFromUrl`.

Mods can already replace definitions and are recorded in save identity, but a mod has no
way to state how a new game starts, and a URL can select only TypeScript-derived bundled
mods. See `deadvox/src/game/bundledMods.ts`, `selectBundledMods`, and
`deadvox/docs/content.md`, "Bundled mods". The starting kit is code. See
`deadvox/src/game/loadout.ts`, `startingLoadout`.

The game reads nothing from the URL hash. The page writes view state back into the query
so a copied link reproduces what the developer sees: the camera through
`deadvox/src/debug/camUrl.ts`, `camUrl`, and the debug panel's look switches and
weathering tuning through `deadvox/src/debug/index.ts`, `syncLookUrl`.

The project owes no backwards compatibility. See
`AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".

## Decision

The core mod is always loaded. Everything that sets up a world or a player comes from mods;
the URL only names which extra mods to load. Ad hoc developer state lives in one object in
the URL hash. Player choices live in player options. The query keeps only the mod list and
harness switches. Each home answers one question:

- **Query:** what content this page loads, and which harness drives it. Changing it means
  a different world, so it needs a reload.
- **Mods:** what the world and the player start as. Content, so it validates, hashes into
  save identity and can be authored without code.
- **Hash:** what the developer is looking at and poking. Never part of save identity.
- **Player options:** how the player prefers to play and render. Persisted per browser,
  never in a shared link.

Every caller follows the same homes, the bench and the tutorial included, so no harness
keeps a private URL format that a later change has to work around.

## Start state in mods

Add a start-state section to the mod schema, alongside the sections in
`deadvox/src/core/schema.ts`, `SECTION_DESCRIPTOR`. Its row describes a new game: the site
layout and its storeys and density, the start time of day, the world seed, the kit, wounds
and skill levels. The default row's pack placement follows the starting-knowledge and
start-row question in `deadvox/docs/pack-split.md`, "Open questions", so its references do
not force skill or setting entries into core. `startingLoadout` and the layout's start time
move from code into content; see `PILLARS.md`, "Content forward compatibility".

The seed in the start row is optional. A mod pins it when its demo must reproduce one
world; otherwise a new game draws one. A hash `seed` overrides it, so exploring other
worlds under the same demo stays a hash edit rather than a new mod.

The start row is an ordinary definition, so it merges like every other one. Changing a
single field of it from another mod follows `docs/decisions/0007-typed-field-patches.md`,
"Decision".

When browser loading of Jsonnet mods is built (issue #801), it must let a browser mod
import bundled pack sources, so a browser mod can build on the same sources a demo mod
does at build time.

The kit is a list of entries. Each names an item and optionally a count and condition, and
says where it goes: worn, in the dominant or off hand, in a pocket of another named entry,
or fitted into a slot of another entry. A magazine entry can be filled. Hands are named by
role, never by side, so a kit follows the player's handedness option: the default
right-handed player holds a dominant-hand item in the right hand, and a left-handed player
never has to swap. This is enough to express every kit `equipDebugLoadout` builds.

Validation runs at two boundaries:

- **Pack admission** checks references: item, layout, skill and wound ids resolve, named
  parents exist and come earlier in the list, and no hand is named twice. These join
  `referenceIssues` in `deadvox/src/core/content.ts`, so `validate` and the panel report
  them like any other content issue.
- **New game** places the kit through ordinary inventory adds. A placement the inventory
  refuses, such as an item too big for its pocket, stops startup with a diagnostic naming
  the mod and the entry. It never silently drops an item.

Start state applies only to a new game. Continue and replay restore the saved world and
ignore it, as they ignore the starting kit.

## Demo mods and URL loading

Demo mods are ordinary mod JSON with a top-level `id`, authored in Jsonnet under a new
source root `deadvox/src/content/demo`, added to `tools/jsonnet/compile.mjs`,
`SOURCE_ROOTS`, and bundled with the game. They join the TypeScript-derived bundled mods
in one id namespace and go through the same intake, `deadvox/src/game/browserMods.ts`,
`evaluateMods`. See `docs/jsonnet.md`, "Source boundaries".

`?mods=` takes a comma-separated list of bundled and demo mod ids, loaded in the order
given. It never fetches a file: every mod a link can name is reviewed, bundled content, so
links raise no remote-fetch, CORS or trust questions. Arbitrary files go through the mods
panel. An unknown id stops startup with the usual diagnostics. The mods panel moves to its
own `?modpanel` switch.

URL mods and panel mods combine, so a demo can be tried with a player's own mods. Load
order is the core mod, then URL mods in URL order, then enabled panel mods in panel order.
Later packs replace earlier definitions, so a panel mod can override a demo. Saves record
every admitted pack in that order, through the existing identity in
`deadvox/src/core/saveFormat.ts`, `currentSaveVersionIdentity`. A world started under a
demo is stored apart from a normal world and only resumes with the same mods, which is
the rule `deadvox/docs/content.md`, "Browser mod identity" already sets.

The tutorial is a bundled mod with its own start row, and the game recognises a tutorial
run from the loaded start row. A prepared game then has one way to start, whether it is a
demo, a bench world or the tutorial.

## Hash state

The hash is one object in a relaxed JSON-like form: bare keys, bare word strings, numbers,
booleans and arrays, as in `#{cam:[1.5,2,3,90,0],debug:true}`. It stays readable and
editable in the address bar, where strict JSON would turn every quote into `%22`. The page
parses it once at startup. Its bounds:

- A byte limit in trusted startup configuration under `deadvox/src/config`, like the
  browser-mod intake limit, checked before parsing.
- A fixed nesting depth, and keys and value types checked against one schema.
- An unknown key or a value of the wrong type stops startup with a visible error naming
  the key, as an unknown query parameter does.

Keys are of two kinds. **Start keys** (seed, radius, actors, decals, debug and the bench
run keys) apply at page load, and changing them reloads the page. **Live keys** (camera,
look switches, weathering tuning, interaction ray) apply on a `hashchange` without
reloading.

The page writes back the camera and every live key the debug panel changes, so a copied
link still reproduces what the reporter saw; only its home moves from the query to the
hash. Write-back goes through `history.replaceState` with the throttling and change
thresholds the camera already uses, so moving the camera or a slider never adds history
entries. Write-back keeps every other key as given and writes keys in a fixed order, so
links stay stable and diffable. Restoring the camera keeps the pitch clamp in
`deadvox/src/debug/camUrl.ts`, `parseCamParam`, and ignores roll.

After death, New world keeps the query and the rest of the hash and changes only the hash
seed. See `deadvox/src/ui/death.ts`.

## Where each parameter goes

**To mods (start row or definitions):**

- site, storeys, density, time and seed move into the start row, with the hash seed
  override described in "Start state in mods";
- loadout, wound, firearmsCombat and inventoryManagement become demo mods with kits,
  wounds and skill levels;
- the debug backpack from `deadvox/src/debug/debugLoadout.ts`, `equipDebugBackpack`,
  becomes a `debug-kit` demo mod, so debug no longer changes the world;
- the weathering profile override in `deadvox/src/core/weatheringUrl.ts`,
  `resolveWeatheringUrl`, becomes a mod replacing a profile or the site's profile
  reference;
- the tutorial site becomes the tutorial mod.

**To the hash:** cam, at, seed, debug, radius, actors, decals, the look switches in
`LOOK_PARAMS`, the weathering tuning fields in `WEATHERING_URL_PARAMS` other than the
profile, interactionray, the voice-size probe's pitches, and the debug render knobs
wobbleFlat, wobbleNoiseScale and weatheringSplit.

**To player options:** handedness and the graphics settings in
`deadvox/src/core/graphics.ts`, `GRAPHICS_KNOBS`. Handedness is honoured only under debug
in `configFromUrl`; as a player option it applies in every game. A test that needs a
graphics setting loads a demo mod that replaces the core graphics policy default; see
`deadvox/docs/content.md`, "Graphics policy".

**Staying as harness query switches:** save-backend, save-test, render, bench, skyRoute
and debug-error. They choose the harness, not the game.

**Bench mode:** `bench` stays a harness switch and picks which bench runs; everything else
the bench reads follows the same homes as the game, with no bench exemption.

- Its world setup, the site with its storeys and density and the time of day, becomes
  demo mods that a bench link names through `?mods=`, including the default bench worlds
  that `benchRunFromUrl` and `shamblerRunFromUrl` fall back to.
- Its run settings, the plan, the run index, quick mode, the shambler counts and the
  post-processing switch, become hash start keys. The seed is the hash seed override.
- A bench steps to its next run by rewriting the hash and reloading, keeping the query, so
  each run loads the same mods. See `deadvox/src/bench/run.ts`, `nextUrl`.

**Out of scope:** the site map and vehicle spike pages keep their own parameters.

The game entry rejects any query parameter other than `mods`, `modpanel` and the harness
switches with a visible startup error naming it. A stale bookmark or test URL then fails
instead of silently testing the wrong world, which matters without legacy support.

## Browser scripts and CI

Browser scripts stop concatenating query strings. One helper under `deadvox/test/browser`
builds a game URL from a mod list, a hash object and harness switches, so the format lives
in one place. Each slice moves every browser script, CI workflow and playtest URL that
uses a parameter it moves, so each slice lands green on its own. Among them are
`.github/workflows/deadvox-browser.yml`, `deadvox/tools/publish-playtest.mjs` and
`test/site-launcher.test.mjs`. The rejection of unknown parameters lands last and then
catches any script a slice missed.

## Slices

Each slice is one PR and leaves every URL that a later slice still owns working. Start
state comes first, so the flashlight demo proves the mod path before anything moves onto
it. Tests follow `AGENTS.md`, "Tests": the flashlight proof extends an existing flow
rather than adding a browser stage.

1. **Start state and URL mod loading.** The start section, its validation and new-game
   placement; the default row replacing `startingLoadout`; the demo source
   root; `?mods=` admitting demo mods; `?modpanel`. Every script that opens the panel
   with `?mods=1`, including `deadvox/test/browser/firefox-ui.mjs`, moves to `?modpanel`.
   No other parameter moves. Proof: a flashlight demo mod that starts at night with a
   flashlight in the dominant hand, tested through a new game.
2. **Hash state.** The parser, bounds and schema; the browser URL helper; the camera, look
   switches, weathering tuning, interaction ray, debug, radius and the other hash keys
   moved to the hash, with write-back of the camera and the panel's live keys. The bench
   run settings move to the hash, with the bench's `nextUrl` functions and the scripts
   that start a bench. Presets still in the query that are gated on debug read it from
   the hash. `deadvox/src/game/tutorial.ts`, `tutorialUrl`, carries radius and actors in
   the hash instead of clearing it. `deadvox/test/browser/gauntlet-flow.mjs` and
   `deadvox/test/browser/save-storage.mjs` drop route-fixture and save-lock-holder, which
   nothing in the game reads.
3. **Debug presets to demo mods.** Loadouts, wounds, skill levels, the debug backpack, site,
   time, storeys, density, seed and the weathering profile leave the query for demo mods,
   with the playtest publisher and CI workflows that use them. The seed moves into the
   start row, with its hash override, and New world changes the hash seed. The bench's
   world setup becomes demo mods. The voice-size probe in
   `deadvox/src/game/shamblerAudio.ts` gates on the started layout instead of the site
   parameter. The tutorial becomes a bundled mod: `deadvox/src/game/tutorial.ts` detects
   it from the loaded start row instead of `site=tutorial`, and `tutorialUrl` selects it
   through `?mods=`.
4. **Player options and rejection.** Handedness and graphics leave the URL. Kept separate
   because it adds options UI, which slices 1 to 3 do not need. Rejection of unknown query
   parameters lands here, once every parameter this ADR moves has left the query with the
   scripts that use it.

## Consequences

A demo is a content file and a link, with no new code, and the same file serves a CI
script, a playtest, a bench run and a bug report. Demo worlds get their own save identity,
so they never overwrite a normal world. Developer view state can change without touching
content identity.

The start section is a new content contract that every future spawn feature must go
through, and kit placement errors surface only at new-game time, not at validation.
Shared links lose player options by design: a link that needs a graphics setting must
name a mod.

The bench loses its private URL format: a bench link names demo mods and a hash like any
other link, and a bench world is authored as content rather than read from a parameter.
