---
read_if:
  - you add, move or remove a Deadvox game-entry URL parameter or hash key
  - you author a demo mod or change how a URL selects mods
  - you change the mod start-state section, the starting kit or how a new game is set up
  - you change how the camera or other view state is written back to the URL
  - you write a browser test or CI script that opens the game with a prepared URL
  - you change how the bench reads its run parameters
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

The bench runs on the same entry and reads its own run parameters. See
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

## Start state in mods

Add a start-state section to the mod schema, alongside the sections in
`deadvox/src/core/schema.ts`, `SECTION_DESCRIPTOR`. Its row describes a new game: the site
layout and its storeys and density, the start time of day, the kit, wounds and skill
levels. The core mod carries the default row, so `startingLoadout` and the layout's start
time move from code into `deadvox/src/content/base`. Tunables belong in content; see
`PILLARS.md`, "Content forward compatibility".

The start row replaces whole, by id, like every other definition, so the existing merge in
`deadvox/src/core/content.ts`, `buildRegistry`, needs no new rule. A demo mod that wants
the normal kit plus one item imports the core row in Jsonnet and overrides one field, so
it follows base edits without a second copy.

The kit is a list of entries. Each names an item and optionally a count and condition, and
says where it goes: worn, in a hand, in a pocket of another named entry, or fitted into a
slot of another entry. A magazine entry can be filled. How a kit names hands is
Question 10; the recommendation is dominant or off-hand, so a kit honours the player's
handedness option. This is enough to express every kit `equipDebugLoadout` builds.

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
- An unknown key or a value of the wrong type is reported, naming the key, as Question 8
  decides.

Keys are of two kinds. **Start keys** (the seed, if Question 1 puts it here, radius,
actors, decals, debug) apply at page load, and changing them reloads the page. **Live
keys** (camera, look switches, weathering tuning, interaction ray) apply on a
`hashchange` without reloading.

Any write-back moves from the query to the hash, and Question 6 decides which keys it
covers.
Whatever it writes goes through `history.replaceState` with the throttling and change
thresholds the camera already uses, so moving the camera or a slider never adds history
entries. Write-back keeps every other key as given and writes keys in a fixed order, so
links stay stable and diffable. Restoring the camera keeps the pitch clamp in
`deadvox/src/debug/camUrl.ts`, `parseCamParam`, and ignores roll.

After death, New world keeps the query and the rest of the hash and changes only the seed,
wherever Question 1 puts it. See `deadvox/src/ui/death.ts`.

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

**Bench mode:** under `bench`, the entry runs the bench, which reads its run parameters
through the bench functions named in "Context". Whether those stay in the query as a
harness exemption is Question 11.

**Out of scope:** the site map and vehicle spike pages keep their own parameters. Tutorial
is Question 7.

The game entry rejects any query parameter outside the mod list, the harness switches,
the bench parameters Question 11 keeps and any parameter a BR answer keeps in the query
(Question 1, Question 7). Question 8 decides whether rejection is a visible error or a
warning. Without legacy support, a stale bookmark or test URL must not silently drop its
setup.

## Browser scripts and CI

Browser scripts stop concatenating query strings. One helper under `deadvox/test/browser`
builds a game URL from a mod list, a hash object and harness switches, so the format lives
in one place. Each slice moves every browser script, CI workflow and playtest URL that
uses a parameter it moves, so each slice lands green on its own. Among them are
`.github/workflows/deadvox-browser.yml`, `deadvox/tools/publish-playtest.mjs` and
`test/site-launcher.test.mjs`. The rejection of unknown parameters lands last and then
catches any script a slice missed.

## Slices

Each slice is one PR and leaves every URL that a later slice still owns working. Tests
follow `AGENTS.md`, "Tests": the flashlight proof extends an existing flow rather than
adding a browser stage.

1. **Start state and URL mod loading.** The start section, its validation and new-game
   placement; the default row in the core mod replacing `startingLoadout`; the demo source
   root; `?mods=` admitting demo mods; `?modpanel`. Every script that opens the panel
   with `?mods=1`, including `deadvox/test/browser/firefox-ui.mjs`, moves to `?modpanel`.
   No other parameter moves. Proof: a flashlight demo mod that starts at night with a
   flashlight in hand, tested through a new game.
2. **Hash state.** The parser, bounds and schema; the browser URL helper; the camera, look
   switches, weathering tuning, interaction ray, debug, radius and the other hash keys
   moved to the hash, with write-back as Question 6 decides. Presets still in the query
   that are gated on debug read it from the hash. `deadvox/src/game/tutorial.ts`,
   `tutorialUrl`, carries radius and actors in the hash instead of clearing it.
   `deadvox/test/browser/gauntlet-flow.mjs` and `deadvox/test/browser/save-storage.mjs`
   drop route-fixture and save-lock-holder, which nothing in the game reads. Under
   Question 1b the seed moves to the hash here, and under Question 11b so do the bench
   parameters, each with the scripts and the New world link that use it.
3. **Debug presets to demo mods.** Loadouts, wounds, skill levels, the debug backpack, site,
   time, storeys, density and the weathering profile leave the query for demo mods, with
   the playtest publisher and CI workflows that use them. The voice-size probe in
   `deadvox/src/game/shamblerAudio.ts` gates on the started layout instead of the site
   parameter. `deadvox/src/game/tutorial.ts` stops detecting the tutorial through
   `site=tutorial`: under Question 7a the tutorial becomes a bundled mod and is detected
   from the loaded start row, and under Question 7b it gets its own query switch. Under
   Question 1a or 1c the seed moves into the start row here, with the hash override under
   1a; under Question 11c the bench scenarios become demo mods here.
4. **Player options and rejection.** Handedness and graphics leave the URL. Kept separate
   because it adds options UI, which slices 1 to 3 do not need. The entry starts
   rejecting unknown parameters as "Where each parameter goes" describes only once every
   parameter this ADR or a BR answer moves has left the query, with the scripts that use
   it.

If Question 9 reorders the slices, the rejection still lands in whichever slice is last.

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
6. **Look links.** The camera, and the look switches and weathering tuning changed in the
   debug panel, already rewrite the query, so a copied link reproduces the current view.
   What does the hash write back?
   - a. The camera and every live key the panel changes. _Recommended:_ keeps the
     present reproduction, so a bug-report link still shows what the reporter saw; only
     its home moves to the hash.
   - b. Camera only. Drops the present look-link reproduction: switches and sliders set
     in the panel no longer reach the link.
   - c. Nothing. The hash stays exactly what the developer typed, and a link no longer
     follows the camera either.
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
10. **Hand naming.** The request said "flashlight in right hand"; a kit can name hands by
    side or by role.
    - a. Dominant or off-hand only. _Recommended:_ the kit follows the player's
      handedness, so the flashlight is in the right hand for the default right-handed
      player and never forces a left-handed player to swap.
    - b. Left or right only; a kit pins the side regardless of handedness.
    - c. Either; a kit may name a role or a side.
11. **Bench parameters.** The bench runs on the game entry with its own run parameters.
    - a. A harness exemption: under `bench` they stay in the query and the rejection
      skips them. _Recommended:_ they are a harness's arguments rather than game state,
      and bench plans already pick their own site and time per run.
    - b. They move into the hash like the game's view state.
    - c. Bench scenarios become demo mods selected through `?mods=`.
