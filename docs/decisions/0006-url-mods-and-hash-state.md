---
read_if:
  - you add, move or remove a Deadvox game-entry URL parameter or hash key
  - you author a demo mod or change how a URL selects mods
  - you change the mod start-state section, the starting kit or how a new game is set up
  - you change how the camera or other view state is written back to the URL
  - you write a browser test or CI script that opens the game with a prepared URL
tags: [deadvox, adr, mods, url, debug, testing]
---

# 6. URL switches become mods and hash state

## Context

The game entry reads a long list of query parameters. Some prepare a world (site, time,
storeys, density, weathering), some prepare the player (debug loadouts, wounds, skill
levels), some only change what the developer sees (camera, look switches, the interaction
ray) and some drive test harnesses. Each preset is TypeScript that reads its own
parameter, so a new demo needs code, and none of it is content a mod could provide. See
`deadvox/src/game/config.ts`, `configFromUrl`, `deadvox/src/debug/debugLoadout.ts`,
`equipDebugLoadout`, and `deadvox/src/debug/lookUrl.ts`, `parseLookParams`.

Mods can already replace definitions and are recorded in save identity, but a mod has no
way to state how a new game starts, and a URL can select only TypeScript-derived bundled
mods. See `deadvox/src/game/bundledMods.ts`, `selectBundledMods`, and
`deadvox/docs/content.md`, "Bundled mods". The starting kit is code. See
`deadvox/src/game/loadout.ts`, `startingLoadout`.

The game reads nothing from the URL hash, and the camera rewrites the query. See
`deadvox/src/debug/camUrl.ts`, `camUrl`.

The project owes no backwards compatibility. See `AGENTS.md`, "Project stage: pre-pre-alpha,
no backwards compatibility".

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

## Start state in mods

Add a start-state section to the mod schema, alongside the sections in
`deadvox/src/core/schema.ts`, `SECTION_DESCRIPTOR`. Its row describes a new game: the site
layout and its storeys and density, the start time of day, the kit, wounds and skill
levels. The core mod carries the default row, so `startingLoadout` and the layout's start
time move from code into `deadvox/src/content/base`, as `PILLARS.md`, "Content forward
compatibility" asks for tunables.

The start row replaces whole, by id, like every other definition, so the existing merge in
`deadvox/src/core/content.ts`, `buildRegistry`, needs no new rule. A demo mod that wants
the normal kit plus one item imports the core row in Jsonnet and overrides one field, so
it follows base edits without a second copy.

The kit is a list of entries. Each names an item and optionally a count and condition, and
says where it goes: worn, in a hand, in a pocket of another named entry, or fitted into a
slot of another entry. A magazine entry can be filled. Hands are named as dominant or
off-hand, never left or right, so a kit honours the player's handedness option. This is
enough to express every kit `equipDebugLoadout` builds.

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
given. An unknown id stops startup with the usual diagnostics. The mods panel moves to
its own `?modpanel` switch so a demo and panel mods can combine.

Load order is the core mod, then URL mods in URL order, then enabled panel mods in panel
order. Later packs replace earlier definitions, so a panel mod can override a demo. Saves
record every admitted pack in that order, through the existing identity in
`deadvox/src/core/saveFormat.ts`, `currentSaveVersionIdentity`. A world started under a
demo is stored apart from a normal world and only resumes with the same mods, which is
the rule `deadvox/docs/content.md`, "Browser mod identity" already sets.

## Hash state

The hash is one object in the syntax chosen under "Questions for BR". The page parses it
once at startup. Its bounds:

- A byte limit in trusted startup configuration under `deadvox/src/config`, like the
  browser-mod intake limit, checked before parsing.
- A fixed nesting depth, and keys and value types checked against one schema.
- An unknown key or a value of the wrong type is a visible startup error naming the key.
  A typo must not silently produce a different view.

Keys are of two kinds. **Start keys** (the seed, if Question 1 puts it here, radius,
actors, decals, debug) apply at page load, and changing them reloads the page. **Live
keys** (camera, look switches, interaction ray) apply on a `hashchange` without reloading.

The page writes back only the camera, with the throttling and change thresholds it already
uses, through `history.replaceState`, so moving the camera never adds history entries.
Write-back keeps every other key as given and writes keys in a fixed order, so links stay
stable and diffable. Restoring the camera keeps the pitch clamp in
`deadvox/src/debug/camUrl.ts`, `parseCamParam`, and ignores roll.

After death, New world keeps the query and the rest of the hash and changes only the seed.
See `deadvox/src/ui/death.ts`.

## Where each parameter goes

**To mods (start row or definitions):**

- site, storeys, density and time move into the start row;
- loadout, wound, firearmsCombat and inventoryManagement become demo mods with kits,
  wounds and skill levels;
- the debug backpack from `deadvox/src/debug/debugLoadout.ts`, `equipDebugBackpack`,
  becomes a `debug-kit` demo mod, so debug no longer changes the world;
- the weathering profile override in `deadvox/src/core/weatheringUrl.ts`,
  `resolveWeatheringUrl`, becomes a mod replacing a profile or the site's profile
  reference.

**To the hash:** cam, at, debug, radius, actors, decals, the look switches in
`LOOK_PARAMS`, interactionray, the voice-size probe's pitches, and the debug render knobs
wobbleFlat, wobbleNoiseScale and weatheringSplit.

**To player options:** handedness and the graphics settings in
`deadvox/src/core/graphics.ts`, `GRAPHICS_KNOBS`. A test that needs a graphics setting
loads a demo mod that replaces the core graphics policy default; see
`deadvox/docs/content.md`, "Graphics policy".

**Staying as harness query switches:** save-backend, save-test, save-lock-holder, render,
bench, route-fixture, skyRoute and debug-error. They choose the harness, not the game.

**Out of scope:** separate pages (the bench, site map, vehicle spike and playtest
pages) keep their own parameters. Tutorial is Question 7.

The game entry rejects any query parameter outside the mod list and harness switches,
with a visible error naming it. Without legacy support, a stale bookmark or test URL must
fail loudly instead of silently dropping its setup.

## Browser scripts and CI

Browser scripts stop concatenating query strings. One helper under `deadvox/test/browser`
builds a game URL from a mod list, a hash object and harness switches, so the format lives
in one place. Each slice moves the scripts it touches to the helper, and the entry's
rejection of unknown parameters makes any missed script fail in CI rather than test the
wrong world. The workflows in `.github/workflows/deadvox-browser.yml`,
`tools/publish-playtest.mjs` and `test/site-launcher.test.mjs` move in the slice that
removes the parameters they use.

## Slices

Each slice is one PR. Tests follow `AGENTS.md`, "Tests": the flashlight proof extends an
existing flow rather than adding a browser stage.

1. **Start state and URL mod loading.** The start section, its validation and new-game
   placement; the default row in the core mod replacing `startingLoadout`; the demo source
   root; `?mods=` admitting demo mods; `?modpanel`. Proof: a flashlight demo mod that
   starts at night with a flashlight in the dominant hand, tested through a new game.
2. **Hash state.** The parser, bounds and schema; the camera moved to the hash with
   write-back; then the look switches, interaction ray, debug, radius and the other hash
   keys; the browser URL helper; rejection of unknown parameters.
3. **Debug presets to demo mods.** Loadouts, wounds, skill levels, the debug backpack, site,
   time, storeys, density and weathering leave the query for demo mods; their browser
   scripts move to the helper.
4. **Player options.** Handedness and graphics leave the URL. Kept separate because it
   adds options UI, which slices 1 to 3 do not need.

## Consequences

A demo is a content file and a link, with no new code, and the same file serves a CI
script, a playtest and a bug report. Demo worlds get their own save identity, so they never
overwrite a normal world. Developer view state can change without touching content
identity.

The start section is a new content contract that every future spawn feature must go
through, and kit placement errors surface only at new-game time, not at validation.
Shared links lose player options by design: a link that needs a graphics setting must
name a mod.

## Questions for BR

1. **Seed.** Where does the world seed come from?
   - a. A start-row field a mod may pin, with a hash `seed` overriding it for ad hoc
     worlds. _Recommended:_ demos can be reproducible and ad hoc exploring stays a hash
     edit.
   - b. Hash only.
   - c. Mod only; a new seed means a new mod.
   - d. Stays a query parameter.
2. **Hash syntax.**
   - a. A relaxed JSON-like form: bare keys and bare word strings, numbers, booleans and
     arrays, e.g. `#{cam:[1.5,2,3,90,0],debug:true}`. _Recommended:_ readable and
     editable in the address bar; strict JSON there turns every quote into `%22`.
   - b. Strict JSON, percent-encoded.
   - c. `key=value` pairs separated by `&`, no nesting.
3. **Mods by URL.** May `?mods=` also fetch a mod JSON from a URL?
   - a. No, bundled and demo ids only; arbitrary files go through the panel.
     _Recommended:_ no remote fetch, CORS or trust questions, and every demo is
     reviewed content.
   - b. Yes, same-origin paths only.
   - c. Yes, any URL.
4. **Start-row merging.**
   - a. Whole-row replacement; demos import and extend the core row in Jsonnet.
     _Recommended:_ no new merge rule.
   - b. Field-by-field merge across packs.
   - c. Whole-row replacement, plus a kit that adds to the inherited kit.
5. **URL mods and the panel.**
   - a. Combine: core, URL mods, then panel mods. _Recommended:_ a demo can be tried
     with a player's own mods.
   - b. Exclusive, as with `?mods=1`.
6. **Hash write-back.**
   - a. Camera only; New world also writes the seed. _Recommended:_ the hash stays
     what the developer typed plus where they are looking.
   - b. Every live key, including look switches toggled in the UI.
7. **Tutorial.**
   - a. Becomes a bundled demo-style mod with its own start row. _Recommended:_ one way
     to start a prepared game.
   - b. Stays its own query switch, out of scope.
8. **Unknown parameters and hash keys.**
   - a. Visible startup error. _Recommended:_ stale test URLs fail instead of testing
     the wrong world.
   - b. Console warning and continue.
9. **Slice order.**
   - a. As above, start state first. _Recommended:_ the flashlight demo proves the
     mod path before anything moves onto it.
   - b. Hash first, since it touches no content contract.
