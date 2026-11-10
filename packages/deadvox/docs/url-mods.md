---
read_if:
  - you add, move or remove a Deadvox game-entry URL parameter or hash key
  - you author a demo mod or change how a URL selects mods
  - you change scenario-owned starts, product defaults or the starting kit
  - you change admission or ordinary inventory placement of authored starts
  - you change how the camera or other view state is written back to the URL
  - you write a browser test or CI script that opens the game with a prepared URL
  - you change how the bench reads its run parameters or sets up its world
  - you build browser loading of Jsonnet mods
  - you coordinate URL mod loading with default mod selection or authoring-tool handoff
tags: [deadvox, mods, url, debug, testing, design]
---

# URL mods and hash state

This is the design plan for `docs/decisions/0006-url-mods-and-hash-state.md`, which holds the decision and its reasons.

## Start state in mods

Start rows belong to scenario content because location and kit depend on the map and run. A scenario may provide several starts, and a mod may add one. The product entry pack names its default scenario and start; a player picker is later UI work. See `docs/decisions/0009-content-defined-products.md`, "Starts and mixing".

Start definitions use ordinary admission rather than a private preset path; see `packages/engine/src/core/schema/starts.ts`, `StartSchema`, and `packages/engine/src/core/schema/files.ts`, `CONTENT_SECTIONS`. Shared topics need no scenario or start row because definitions are inert until a playable stack supplies its run.

The entry pack chooses the default normal run so reusable topics need not know its identity. Fresh product games select admitted rows and place their normal kit through ordinary owners; see `packages/engine/src/core/packAdmission.ts`, `PackManifestSchema`, `packages/engine/src/game/config.ts`, `configFromUrl`, and `packages/presentation/src/presentation/play.ts`, `startPlay`. A generated world is still a mechanism selected by content, not an authored scenario identity in runtime code.

Initial recipe knowledge belongs to the selected start; skill-earned unlocks remain character-owned. See `packages/engine/src/core/character.ts`, `initializeProgression`. Debug kits combine a normal start with the spawn menu or a mod-owned start row, rather than per-kit base starts. Enabling debug tools alone changes no starting inventory, wounds or progression. A backpack is an ordinary item, obtained through the same paths. Mod and test-fixture starts use ordinary admission and placement; debug-only selection stays with `packages/engine/src/game/startSelection.ts`, `requireStart`.

The seed in the start row is optional. A mod pins it when its demo must reproduce one world; otherwise a new game draws one. A hash `seed` overrides it, so exploring other worlds under the same demo stays a hash edit rather than a new mod.

The start row is an ordinary definition. Changing a single field of it from another mod follows `docs/decisions/0007-typed-field-patches.md`, "Decision".

When browser loading of Jsonnet mods is built (issue #801), it must let a browser mod import bundled pack sources, so a browser mod can build on the same sources a demo mod does at build time.

Name kit parents before their children so placement order is deterministic rather than a second dependency scheduler. Hands use roles rather than sides so handedness does not require a different kit or a player swap. Initial magazine and cylinder contents remain item state, not a second ammunition inventory. Cylinder state goes through the item's ordinary mechanical and ammunition checks so authored state cannot evade model capacity or calibre. See `packages/engine/src/core/schema/starts.ts`, `StartSchema`; `packages/engine/src/core/startState.ts`, `applyStartState`; and `packages/engine/src/core/items.ts`, `setInitialCylinder`.

Validation and application have separate responsibilities:

- **Pack admission** attributes unresolved references, conflicting site defaults and invalid kit ownership to their start row, using the same diagnostics as other content. See `packages/engine/src/core/startIssues.ts`, `startIssues`, and `packages/engine/src/core/content.ts`, `referenceIssues`.
- **Playable-stack validation** checks each start's recipe, kit and skill roots separately so another start cannot conceal missing knowledge. World sources remain stack-wide: static type reachability is not proof that every recipe can be completed within each individual site. A lower-layer stack without starts needs no playable-world closure. See `packages/engine/src/core/reachability.ts`, `checkStartReachability`, and `src/cli/validate.ts`, `validate`.
- **New game** must use ordinary inventory placement and fitting so content cannot bypass pocket size or slot certification. A refusal stops startup with source and entry attribution instead of silently dropping the item. See `packages/engine/src/core/startState.ts`, `applyStartState`; progression remains character-owned through `packages/engine/src/core/character.ts`, `initializeProgression`.

Callers must identify a fresh game explicitly. Continue and replay restore the saved world and must not reapply kit, wounds or progression, including advancing the item allocator. See `packages/engine/src/core/startState.ts`, `applyStartState`.

## Demo mods and URL loading

Demo mods are ordinary mod JSON with a top-level `id`, authored in Jsonnet under a new source root `src/content/demo`, added to `tools/jsonnet/compile.mjs`, `SOURCE_ROOTS`, and bundled with the game. They join the TypeScript-derived bundled mods in one id namespace and go through the same intake, `packages/engine/src/game/browserMods.ts`, `evaluateMods`. See `docs/jsonnet.md`, "Source boundaries".

`?mods=` takes a comma-separated list of bundled and demo mod ids, loaded in the order given. It never fetches a file; arbitrary files go through mod intake. An unknown id stops startup with the usual diagnostics. A direct `?modpanel` entry may remain, but it is not the only way to reach mod selection: selection belongs in the ordinary start flow, under `docs/decisions/0008-mod-authoring-tool.md`, "Testing, sharing and start flow". URL handoff from the tool is a separate intake contract, not an extension of this bundled-id selector.

URL mods and panel mods combine, so a demo can be tried with a player's own mods. Load order is the bundled packs, then URL mods in URL order, then enabled panel mods in panel order. Conflicts between them follow `docs/decisions/0007-typed-field-patches.md`, "Decision". Saves record every admitted pack in that order, through `packages/engine/src/core/saveFormat.ts`, `currentSaveVersionIdentity`. A world started under a demo only resumes with the same mods, the rule `content.md`, "Browser mod identity" sets.

## Committed scenarios

Committed scenarios, the tutorial among them, are real mods a link picks through `?mods=`, so a playtest link, the practice link and a test name a world the same way a player's mod does. Each is an opt-in pack that names its scenario's start as its default start and depends on the scenario's content. The content stays in the product's default stack, which other pages and tools read, so picking the pack changes only where the run starts. See `packages/deadvox/mods/skelly.deadvox.scenario.playtest.play/pack/manifest.jsonnet`.

The practice link adds the practice pack after the page's own mods, so its start wins by load order while the player's mods carry over, and leaving practice drops it again; see `packages/presentation/src/presentation/tutorialUrl.ts`, `tutorialUrl`. `start-mod` does not fit, because it refuses a pack without exactly one start row of its own. The game finds the practice pack from content rather than naming it in code, and knows a practice run from its start row, so every link that starts the tutorial gets practice's isolation from saves. See `packages/engine/src/game/bundledMods.ts`, `practiceModId`, and `packages/engine/src/game/startSelection.ts`, `isPracticeStart`.

## Start mod

`start-mod` names the run's starting point and gear, so a test or link that needs its own fixture owns that start config itself rather than fiddling with one parameter per setting. Its value is either a bundled or committed mod id or inline mod JSON: a value whose first non-space character is `{` is inline data, anything else is an id. One parameter takes both forms, so a link cannot name its start two ways; a refusal names the form it read. See `packages/engine/src/game/bundledMods.ts`, `startModFromUrl`.

Inline data goes through the same intake as a player's mod, with its admission, diagnostics and byte limit, and the save identity records it as an intake-admitted mod hashed from its data, so a world resumes only with the same data. An id loads like a `?mods=` entry. The start mod loads after the `?mods=` list and must supply exactly one start row; any other count stops startup with a visible error. See `packages/engine/src/game/bundledMods.ts`, `selectBundledMods`.

The run starts from the start mod's row, else the default start of the last admitted pack that names one, so a scenario loaded through `?mods=` comes before the product entry pack's default. See `packages/engine/src/game/startSelection.ts`, `runStartId`. Beside `start-mod`, a link cannot name `site` or `start`, repeat `start-mod` or open the mods panel; see `src/pageUrl.ts`, `readPageUrl`. The time of day is the start row's, else the day cycle's default; while the `time` query remains, it overrides both, so a stage that still passes it keeps its light.

## Hash state

The hash is one object in a relaxed JSON-like form: bare keys, bare word strings, numbers, booleans and arrays, as in `#{debug:true,cam:[1.5,2,3,90,0,0]}`. Strict JSON would turn every quote into `%22` in the address bar. Other text is a JSON string, escapes and all, and the writer writes `%` as `%25`, so the address bar's percent-encoding is the only encoding the reader undoes and every value written reads back; see `src/hashState.ts`, `writeHash`. The page reads it once at startup through `src/pageUrl.ts`, `pageUrl`. Its keys and value types are checked against one schema, `src/hashState.ts`, `HASH_KEYS`, and an unknown key or a value of the wrong type stops startup with a visible error naming the key, as an unknown query parameter does. Its remaining bounds belong to slice 2:

- A byte limit in trusted startup configuration under `src/config`, like the browser-mod intake limit, checked before parsing.
- A fixed nesting depth.

Every hash key applies at page load, and any `hashchange` reloads the page; see `src/main.ts`. The game reads its hash once, so one reload path replaces a second path that would apply each key live.

The debug panel writes back the camera and every look and weathering tuning key it changes, so a copied link reproduces the developer state the hash supports. The weathering profile choice is live only and is not written, so after a reload the site's own profile applies with the copied tuning. Write-back goes through `src/pageUrl.ts`, `replacePageUrl`, which fires no `hashchange`, so writing back never reloads the page and never adds history entries. The camera writes keep the throttling and change thresholds in `src/debug/camUrl.ts`, `camWriteDue`. Write-back keeps every other key as given and writes keys in a fixed order, so links stay stable and diffable. Restoring the camera keeps the pitch clamp in `src/debug/camUrl.ts`, `parseCamParam`, and ignores roll.

After death, New world keeps the query and the rest of the hash and changes only the hash seed. See `src/product/page.ts`, `newWorldHref`.

## Where each parameter goes

Settings without a home are not supported. One that is needed comes back as a mod, not a query parameter, so the query never again grows a second home for state that content or the hash already owns.

**In the start row:** storeys and density, with the seed and its hash override in "Start state in mods". A world reads them only from its start; see `packages/engine/src/game/config.ts`, `configFromUrl`. Debug kits use the spawn menu or mod-owned start rows; wounds and skill levels require an authored row, not query switches. Enabling development tools alone must not grant a backpack or change the world.

**In content:** the weathering profile is the site's authored profile or the default; see `packages/engine/src/game/config.ts`, `applyWeatheringConfig`. The debug panel can apply another profile live, but the address does not keep that choice.

**To the hash:** every developer key in `src/hashState.ts`, `HASH_KEYS`, among them the look switches in `src/debug/lookUrl.ts`, `LOOK_KEYS`, and the weathering tuning fields in `packages/engine/src/core/weatheringUrl.ts`, `WEATHERING_TUNING_KEYS`.

**To player options:** the graphics settings in `packages/engine/src/core/graphics.ts`, `GRAPHICS_KNOBS`, stored per player; no link sets them. Handedness is the player's choice when a new character is created, so no link sets it; see `packages/presentation/src/ui/saveController.ts`, `SaveController.launchNewWorld`. A test that needs a graphics setting loads a demo mod that replaces the core graphics policy default; see `content.md`, "Graphics policy".

**Staying as harness query switches:** save-backend, save-test, render, bench, skyRoute and debug-error. They choose the harness, not the game.

**Still in the query pending a decision:** site, time and start. CI stages select their world with them, so they stay until their home is decided; see `src/pageUrl.ts`, `UNHOMED_QUERY`. Published playtest links and the practice link pick committed scenarios instead; see "Committed scenarios".

**Bench mode:** `bench` stays a harness switch and picks which bench runs; everything else the bench reads follows the same homes as the game, through the same reader and the same refusal of unknown parameters.

- Its world is the site the query names, with the default start's storeys and density, at the time the query names; see `src/bench/run.ts`, `benchGameConfig`.
- Its run settings are hash keys: the plan, the run index, quick mode, the shambler counts of either bench and the post-processing switch, with the seed as the hash seed override. A key the game already has keeps its one meaning, so the bench reuses `post`, `debug` and `actors`.
- A bench steps to its next run by changing only the run index in the hash and reloading, keeping the query, so each run loads the same world. See `src/bench/run.ts`, `loadNextRun`.

**Out of scope:** the site map and vehicle spike pages keep their own parameters.

The game entry stops startup with a visible error naming any query parameter other than `mods`, the harness switches and the parameters still pending a decision, and any hash it refuses; see `src/pageUrl.ts`, `UNHOMED_QUERY`, and `src/main.ts`. A script that still passes a dropped parameter fails at startup.

## Browser scripts and CI

Browser scripts stop concatenating query strings. One helper under `test/browser` builds a game URL from a mod list, a hash object and harness switches, so the format lives in one place. Each slice moves every browser script, CI workflow and playtest URL that uses a parameter it moves, so each slice lands green on its own. Among them are `.github/workflows/deadvox-browser.yml`, `tools/publish-playtest.mjs` and `test/site-launcher.test.mjs`. The rejection of unknown parameters then catches any script a slice missed. A stage that needs a fixture switch sets a page global from an init script rather than a query parameter, since the game refuses any parameter it does not read.

## Slices

The slices preserve each later slice's URLs while migrating one concern at a time. Their delivery must obey `docs/decisions/0009-content-defined-products.md`, "Refactor gate": use an existing PR or wait until the refactor is executed. Start state comes first so the flashlight demo proves the mod path before other setup moves onto it. Tests follow `AGENTS.md`, "Tests": extend an existing flow rather than adding a browser stage.

1. **Start state and URL mod loading.** Build URL mod loading on the admitted new-game path in `packages/engine/src/core/startState.ts`, `applyStartState`: the remaining work is the demo source root, `?mods=` admitting demo mods and `?modpanel`. Every script opening the panel with `?mods=1`, including `test/browser/firefox-ui.mjs`, moves to `?modpanel`. No other parameter moves in this slice. A flashlight-at-night demo with the flashlight in the dominant hand proves the new-game path. This slice owns URL migration, not default-entry UX: the independent default start-flow slice is owned by `docs/decisions/0008-mod-authoring-tool.md`, "Build plan". Coordinate its entry routes with this migration; both use shared admission and save-identity checks.
2. **Hash state.** The game page and the bench read their developer keys and run settings from the hash through `src/pageUrl.ts`, `pageUrl`, and the debug panel writes them back; the remaining work is the hash bounds in `docs/url-mods.md`, "Hash state", and the browser URL helper.
3. **World setup to mods.** Prepared debug inventory, wounds and skill levels belong in mod-owned start rows. The seed moves into the start row, with its hash override, and New world changes the hash seed. The voice-size probe in `packages/engine/src/game/actorAudio.ts` gates on the started layout instead of the site parameter. Site, time and start wait for the decision named in "Where each parameter goes"; once it moves them with the CI workflows that use them, `src/pageUrl.ts`, `UNHOMED_QUERY`, is empty and goes.
