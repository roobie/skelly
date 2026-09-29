# deadvox maintainability review (2026-09-29, read-only)

Repo: `/home/bjorn/devel/skelly`, branch `main` at `efd3e9f`. Scope: `deadvox/` only.

## 0. Derived inputs

| Input | Value | Basis |
| --- | --- | --- |
| Lifespan | **will evolve** (DERIVED) | EPIC.md, "How each slice runs": *"Build: in PR-sized milestones. Each one is merged and deployed to Pages, with CI green (Biome, types, tests, content validation, golden saves)."* and *"Record findings: update DESIGN.md, CHALLENGES.md and this document. Then plan the next slice."* EPIC.md lists 8 slices with *"Each slice needs the one before it"*. PROJECT.md: *"the game is mostly simulation and UI, so both must be easy to grow."* Nothing describes Slice 1 code as disposable; ADR 0002 plans save state per slice through Slice 8. So: refactor findings **and** the knowledge check both apply (method step 4). |
| Changes expected next | (1) **1.8.5 shambler body regions** — SLICE-1.md: *"Pulled forward from Slice 3 by BR on 2026-09-29 … The shambler's single health pool becomes body regions … A melee hit damages the region it lands on. Today the hit test only checks the aim ray against one point per shambler, at 0.55 of its height (`src/core/zombies.ts:1025`), so it has to learn which region the ray reaches first … Region state is simulation state: it's in the save snapshot and the source fingerprint."* Order: *"after the save-fingerprint fix (saves step 2b) merges, and before save storage and the golden save (1.9)."* (2) **1.9 save storage, autosave, Continue** — ADR 0002 steps 3–5: *"Storage layer. Implement worker-side OPFS A/B writes … Autosave and title screen. Add 2-game-hour, hidden/pagehide and pre-sleep triggers; Continue/New world … Round-trip CI and budget."* (3) **1.10 carried-forward audio** — SLICE-1.md "Missing, carried forward": *"Eating and drinking sounds need cues wired to the completed use-item actions. The flashlight switch needs an on/off cue … The scenario half of the done-when is missing: test that each noise event (footsteps, doors and fights) emits a positional sound."* (4) **Inventory screen port to lit-html** — PROJECT.md: *"Every screen moves over, one at a time, and the inventory screen is the last, at the start of Slice 2."* (1.11 playtest build is also planned but has no design detail yet; it is only referenced where it lands in the same files.) | All DERIVED. |
| Boundaries | Projects independent on purpose; duplication across projects is not a finding. | Given. Root README: *"Subprojects should share the domain-agnostic parts"* is aspirational; no deadvox file imports from `gungen/`, `mobgen/` or `site/` (grep of `deadvox/src`, `test`, `tools` for `../gungen`, `../mobgen`, `../site`, and the words `gungen`/`mobgen` in code: no hits). |
| Main maintainer | **both** (assumed, and supported) | `git log --format=%an -- deadvox`: BR 134, Björn Roberg 8, Claude 41; 78 commit bodies carry `Co-Authored-By: Claude …`. Branch names like `roobie/claude/quirky-goldberg-qxo0pg` (PRs #18, #19) are agent sessions. |

### History (method step 1)

Last 16 merged PRs touching `deadvox/` (`git log --merges --first-parent -- deadvox`), 2026-09-27 → 09-29. Code-file counts exclude `.md`, `.glb`, `.ogg`, `.png`, `.svg`, `.json`, lockfiles.

| PR | Branch | Code files | Size / notes |
| --- | --- | --- | --- |
| #61 | damage-design | 0 (docs) | DESIGN + SLICE-1 1.8.5 |
| #62 | saves-identity (2nd PR on this branch) | 13 | **Follow-up fix** to #56: "fail closed on incomplete simulation fingerprints", "fingerprint extracted world setup" (extracted `worldSetup.ts` from `engine.ts`) |
| #63 | inventory-fix | 5 | **Follow-up fix** to #41: "fix Firefox inventory pointer coordinates" (play.ts, input.ts, +127 lines in Firefox harness) |
| #56 | saves-identity | 11 | Fingerprint tool + vite plugin; also moved `Quickbar` out of `ui/hud.ts` to `game/quickbar.ts` so it could be fingerprinted |
| #50 | saves-format | 7 | `saveFormat.ts` 1155 lines in one PR |
| #48 | saves-snapshot | 24 | snapshot/restore APIs across 12 core files; in-branch fixes "Fix snapshot interruption and boundary semantics", "Persist unread simulation interrupts" |
| #43 | audio | ~40 | in-branch "fix merged audio checks" (play.ts 51 lines, both browser harnesses), "fix Firefox audio startup" |
| #46 | saves (ADR) | 0 (docs) | |
| #42 | melee-models | 19 | in-branch "satisfy biome checks after main merge", "correct upright melee strike direction" |
| #39 | interface-design | 0 (docs) | |
| #41 | rest-sleep (+ ui-polish merged in) | 40 | rest/sleep, debug module split, pointer-lock menu cursor, Chrome CDP harness; many pointer/menu commits ("resume play after pointer unlock", "assert menus close on pointer unlock", "forward drawn-cursor pointer drags") |
| #40 | shambling | 10 | zombies.ts +635 |
| #38 | shamblers | 40 | zombies.ts +355, physics +206; fixes 21/22/24/29 recorded in SLICE-1 |
| #36 | lit-analyzer | 4 | tooling |
| #35 | lit-html-hud-credits | 7 | |
| #34 | lit-html-all-screens | 5 | |

**(a) Files touched by most PRs whatever the feature:** `src/game/play.ts` — **10 of 16** PRs (next: `vite.config.ts`, `core/zombies.ts`, `core/schema.ts`, `ui/hud.ts`, `test/zombies.test.ts`, `test/snapshot.test.ts`, `test/content.test.ts`, `test/hud.test.ts` at 4 each). play.ts is 1087 lines, one closure (`startPlay`), and is the file every parallel branch (audio, melee-models, rest-sleep, shamblers) had to repair after merging main.

**(b) Features that needed follow-up fixes, and why:**
- Save identity (#56 → #62): the first fingerprint walker could miss dependencies (glob/`import.meta.url`/type-only edges) and `engine.ts` pulled three.js into the graph; fixed by failing closed and extracting `worldSetup.ts`.
- Pointer-lock menu cursor (#41 → #63): written and tested against Chrome with pointer lock stubbed; broke in Firefox, the reference browser. See B5.
- Audio (#43) and melee models (#42): in-branch repairs after merging main, concentrated in play.ts and the browser harnesses.

"Next few commits" on `main` is unreliable here: `main` is merges-only, so the commits after a merge are other PRs. I used instead: (i) branch-internal commit titles containing "fix … after merge" / "fix merged"; (ii) the same branch name merged twice (`saves-identity` #56 and #62); (iii) PR titles ending in `-fix`. PR bodies are empty (`%b` of `1dcda05` is blank), so causes come from diffs.

## A. Checks to add

Caveat: the root `node_modules` is not installed in this checkout and `node` is not on the bash PATH, so I could not validate Biome option names against `configuration_schema.json`. The Biome snippets follow the 2.x option shapes; run `npm ci && npm run check` at the root to confirm. Each Biome check has a vitest fallback that needs no new dependency.

### A1. Import boundary: deadvox must not import sibling projects

Currently true (no hits). Pin it. In `biome.jsonc` `overrides`:

```jsonc
{
  "includes": ["deadvox/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "patterns": [
              {
                "group": ["**/gungen/**", "**/mobgen/**", "**/site/**", "../../gungen/*", "../../mobgen/*", "../../site/*"],
                "message": "deadvox is independent of its sibling projects (root README, Subprojects). Copy, don't import."
              }
            ]
          }
        }
      }
    }
  }
}
```

Fallback / belt-and-braces, `deadvox/test/importBoundary.test.ts` (same style as `test/uiLitHtml.test.ts`):

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOTS = ['src', 'test', 'tools'];
const SPECIFIER = /\b(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
const SIBLING = /(^|\/)(gungen|mobgen|site)(\/|$)/;

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : files(join(dir, e.name))) : /\.(m?[jt]s)$/.test(e.name) ? [join(dir, e.name)] : [],
  );

describe('deadvox stays independent of sibling projects', () => {
  it('imports nothing from gungen, mobgen or site', () => {
    const offenders = ROOTS.flatMap(files).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((m) => m[1]!)
        .filter((s) => s.startsWith('.') && (s.includes('../../') || SIBLING.test(s)))
        .map((s) => `${file}: ${s}`),
    );
    expect(offenders).toEqual([]);
  });
});
```

### A2. Core purity: `src/core` has no DOM, three.js or lit-html

PROJECT.md: *"Core | Pure library in `src/core`: no DOM or three.js imports, so it runs in tests, workers and Node"*. Holds today (grep for `from 'three'`, `from 'lit-html'`, `document`, `window`, `navigator` in `src/core`: none) but nothing enforces it, and 1.9's OPFS/IndexedDB storage is the first feature tempted to put `navigator.storage` in core. Biome override:

```jsonc
{
  "includes": ["deadvox/src/core/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "paths": {
              "three": "src/core is pure: rendering lives in src/render (PROJECT.md, Core).",
              "lit-html": "src/core is pure: UI lives in src/ui (PROJECT.md, Core)."
            }
          }
        },
        "noRestrictedGlobals": {
          "level": "error",
          "options": {
            "deniedGlobals": {
              "document": "src/core runs in Node and workers; no DOM.",
              "window": "src/core runs in Node and workers; no DOM.",
              "navigator": "Storage/feature detection belongs in src/game or a worker, not src/core (ADR 0002).",
              "localStorage": "src/core keeps no browser state.",
              "requestAnimationFrame": "src/core is frame-agnostic; the loop is in src/game/play.ts."
            }
          }
        }
      }
    }
  }
}
```

Vitest fallback: same scanner as A1 over `src/core`, asserting no match for `/from '(three|lit-html)'|\b(document|window|navigator|localStorage)\b/`.

### A3. Content validator: a zombie's `model` must name a figure

PROJECT.md known limit: *"Zombie types name a `model`, but it isn't checked against the `models` section yet"*. The base pack already has a `figures` section (`figures-player.json`: `{"id": "player", "palette": {...}}`) and `registry.figures`; the shambler's `"model": "figure_basic"` names nothing. Add to `src/core/content.ts` beside the existing loop at line 356:

```ts
  for (const zombie of registry.zombies.values()) {
    if (zombie.loot !== undefined && !registry.loot.has(zombie.loot)) {
      report('zombies', zombie.id, '.loot', `no loot table "${zombie.loot}"`);
    }
    if (!registry.figures.has(zombie.model)) {
      report('zombies', zombie.id, '.model', `no figure "${zombie.model}"`);
    }
  }
```

and a fixture `test/fixtures/content/missing-figure.json` in `test/validateCli.test.ts`, like `missing-model.json`. This requires either adding `{"id": "figure_basic", "palette": {...}}` to the base pack or pointing the shambler at an existing figure; do it before 1.8.5, which will need per-region palette/hiding anyway.

### A4. Size ratchet on the hotspot (optional)

`biome.jsonc` turns `noExcessiveLinesPerFile` off with the reason *"raw length doesn't [matter]"*. History disagrees for one file: play.ts is 1087 lines and the merge-conflict site for every parallel branch. A ratchet that only stops growth:

```jsonc
{
  "includes": ["deadvox/src/game/play.ts"],
  "linter": { "rules": { "style": { "noExcessiveLinesPerFile": { "level": "error", "options": { "maxLines": 1100 } } } } }
}
```

Lower it each time B1/B3 extract something. If the team prefers not to fight the config comment, skip this and rely on B1/B3.

### A5. Already pinned (keep; don't duplicate)

- Fingerprint scope: `test/simulationFingerprint.test.ts` pins the exact `excludedImports` list and classifies every `src/core` and `src/game` module (fails closed on a new file).
- Save schema exactness: `saveFormat.ts` `obj()` rejects unknown fields (`throw new Error(\`Unknown field ${path}.${key}\`)`) and `encodeSave` validates before writing, so a new `Zombie` field that reaches `snapshotState()` without a schema entry fails the round-trip test loudly.
- Sound ids: `content.ts:378` reports every `SOUND_EVENT_IDS` entry missing from the pack, so the carried-forward 1.10 cues (eat/drink/flashlight) cannot be added to the enum without content.
- lit-html port list: `test/uiLitHtml.test.ts` `NOT_YET_PORTED = new Set(['src/ui/inventoryScreen.ts'])`.

## B. Judgement findings (5; all verified by refutation subagents, none dropped)

### B1. `deadvox/src/game/play.ts#startPlay/fingerprint-exposure` — effort M

Snippet (`tools/simulationFingerprint.ts` and `play.ts`):

```ts
export const SIMULATION_ENTRIES = [
  'src/core/sim.ts',
  …
  'src/game/play.ts',
```
```ts
      // Firefox pins even synthetic PointerEvent.clientX/Y to the pointer-lock center.
      // Override those read-only properties so the inventory receives the game cursor position.
      Object.defineProperties(forwarded, {
        clientX: { value: input.cursorX },
```

Why it matters: the fingerprint hashes each reachable module's whole source (`createHash('sha256').update(source, 'utf8')`) and `decodeSave` refuses on `saved.simulationHash !== running.simulationHash`. play.ts is an entry, so PR #63 (a Firefox pointer fix, 61 lines of play.ts) would have invalidated every save had 1.9 storage existed. The pointer-lock menu forwarding (`dispatchMenuPointer`, `forwardMenuPointer`, the capturing `click` forwarder, `updateGameCursor`; play.ts 513–633, 951–960) reads only `input.cursorX/Y`, `input.locked`, `input.menuPointer` and DOM. Planned changes that land in play.ts: 1.9 autosave triggers and Continue, the inventory lit-html port (which changes exactly this pointer path), 1.11's overlay. Each will bump the hash for every playtester's save. ADR 0002 accepts this ("compatibility follows the module graph"), which means the cure is moving presentation out of the graph, not changing the rule.

Remedy: move the menu pointer forwarding into `src/ui/menuPointer.ts` (takes `input`, `renderer.domElement`, `gameCursor`), add it to `SIMULATION_EXCLUSIONS`, the pinned `excludedImports` list and the ADR's justification list. Same treatment for the HUD text builders (`hudText`, `promptText`, `needsText`) if they move out of the closure.

Verification: subagent confirmed whole-file hashing, the refusal path, and that the block touches no simulation state; it noted a policy nuance (the ADR keeps `inventoryScreen.ts` fingerprinted because it routes actions into mutations; the forwarder is the transport for those events). The extraction still stands because the forwarder decides *where* a DOM event goes, not what inventory does with it.

### B2. `deadvox/test/snapshot.test.ts#createRuntime/parallel-wiring` — effort L

Snippet (test, then game):

```ts
// The scenario factory wires the same deterministic hamlet actors for fresh and restored runs.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep test runtime wiring in one auditable place.
const createRuntime = (snapshot?: ReturnType<typeof snapshotSession>) => {
  …
    jumpSpeed: 7.9 / scale.blockSize,
    player: () => ({
      …
      facing: [Math.sin(player.yaw), 0, -Math.cos(player.yaw)],
      movement: 'still',
```
```ts
  zombieSystem = new ZombieSystem({
    …
    jumpSpeed: PLAYER.jump,
    player: playerSense,          // facing: [-Math.sin(input.yaw), 0, -Math.cos(input.yaw)]
    …
    onDeath: (zombie) => { … rollLoot(registry, table, sim.rng(`zombie-loot:…`)) … }
```

Why it matters: nothing under `src/` calls `snapshotSession`, `encodeSave` or `decodeSave`; the only caller is this test. The N-vs-K/save/load/N−K equivalence proof therefore runs on a second, hand-written runtime that already diverges from `startPlay`: `unsafe: () => undefined` vs `zombieSystem.unsafeReason()` (compression state is saved), no `onDeath` loot (inventory and RNG are saved), no `onFootstep`, the facing x-sign flipped, and `jumpSpeed: 7.9 / scale.blockSize` where the game passes `PLAYER.jump` (=7.9). `canJumpObstacle` computes `(jumpSpeed * jumpSpeed) / (2 * physics.gravity * blockSize)` with `gravity = GRAVITY / blockSize`, which gives the documented 1.1 m only with m/s input — so the test's zombies can clear ~4.5 m and the test cannot see it. There are already five `new ZombieSystem({...})` wirings (play.ts, bench/shamblers.ts, bench/shamblers-cpu.mjs, snapshot.test.ts, rest.test.ts, shamblerFootsteps.test.ts, shamblerSpawning.test.ts). When 1.9 wires autosave/Continue into play.ts, the shipped wiring will be the first real caller and will have no test; closure-local state (`vocalNoise`, `lastZombieStep`, `footstepClock`, `airbornePeakY`, `playerGaitPhase`) is omitted or kept by hand in each copy. 1.8.5 region state must be added to both.

Remedy: extract the "simulation" section of `startPlay` (play.ts 130–315: `Simulation`, `ZombieSystem` options, `Survival`, `RestController`, `Quickbar`, `HandlingQueue`, scheduler registrations, `snapshot()`/`restore()`) into `src/game/session.ts` (fingerprinted, DOM-free; takes callbacks for sounds/notices), the same way #62 extracted `worldSetup.ts`. `createRuntime` in the test and `startPlay` then construct the same object; delete the hand copies of `jumpSpeed`/facing/hooks. The benches can keep their own wiring — they don't save.

Verification: subagent confirmed no production caller, same yaw convention on both sides (so the sign flip is real, though `ZombieSystem` doesn't read `facing` today), and that `unsafe` and `onDeath` reach saved state.

### B3. `deadvox/src/game/play.ts#syncOverlay/menu-state-derivation` — effort M

Snippet:

```ts
    overlay.hidden = (input.locked && !mainMenuOpen) || screen.isOpen || sim.dead !== undefined;
    input.menuPointer = mainMenuOpen || screen.isOpen || (debugTools?.menuOpen ?? false);
```
```ts
    if (debugTools?.handleKey(e)) {
      input.menuPointer = mainMenuOpen || screen.isOpen || debugTools.menuOpen;
```
```ts
    input.menuPointer = mainMenuOpen || screen.isOpen || (debugTools?.menuOpen ?? false);
    …
    sim.paused = !overlay.hidden; // the pause card is up
```

Why it matters: the pause/menu state is spread over `started`, `mainMenuOpen`, `screen.isOpen`, `debugTools.menuOpen` (itself `panelOpen || spawnMenu.isOpen`), `input.locked`, `input.menuPointer`, and two DOM-derived values (`overlay.hidden`, `sim.paused = !overlay.hidden`); the same derivation is written at three sites (490, 758, 1007). PR #41 spent six commits on this ("resume play after pointer unlock", "assert menus close on pointer unlock", "forward drawn-cursor pointer drags", "move main menu key to F9", …) and #63 came back to it. No vitest exercises the transitions (the only `menuPointer`/`paused` hits in `test/` set the fields directly as fixtures); coverage is the two browser harnesses. 1.9's title screen adds Continue/New world/refusal states, and ADR 0002 requires *"Continue always opens paused with inputs released"* — one more input to this hand-derived state.

Remedy: one pure `menuState.ts` in `src/ui` (excluded from the fingerprint) with `{ started, mainMenu, inventory, debugMenu, locked, dead }` → `{ menuPointer, overlayHidden, paused }`, unit-tested in Node; play.ts calls it from one place per frame.

Verification: subagent confirmed no Node test covers the transitions and that all three sites are the same derivation; it noted sites 490/758 are "redundant-but-not-dead" (they serve same-frame readers).

### B4. `deadvox/src/render/figure.ts#FIGURE_BOXES/geometry-location` — effort S

Snippet:

```ts
export const FIGURE_BOXES: Readonly<Record<FigurePart, FigureBox>> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
```
```ts
      const center: Vec3 = [zombie.body.pos[0], zombie.body.pos[1] + zombie.body.height * 0.55, zombie.body.pos[2]];
      …
        perpendicular * this.options.blockSize > 0.65 ||
```

Why it matters: 1.8.5 needs the hit ray to find *which region it reaches first*, and *"Region state is simulation state: it's in the save snapshot and the source fingerprint"*. The limb boxes live only under `src/render/` (directory-excluded from the fingerprint); nothing in `src/core` imports them, and the collision body is already an independent literal (`1.7 / blockSize` height in zombies.ts vs head top 1.58 + 0.16 = 1.74 from the boxes). A core→render import would fail the pinned `excludedImports` test; copying the numbers into core would let a renderer tweak silently desynchronise what the player sees from what the hit test uses. `figure.ts` has no imports at all, so it can move.

Remedy: move `figure.ts` to `src/core/figure.ts`; `render/zombies.ts` and `render/playerFigure.ts` import from there. Do it as the first commit of 1.8.5.

Verification: subagent confirmed all three sub-claims and the pinned-test consequence.

### B5. `deadvox/tools/ui-browser-contract.mjs#harness/browser-split` — effort M

Snippet (`package.json`, and each harness's first line):

```json
    "test:ui-browser": "node tools/ui-browser-contract.mjs",
    "test:browser:firefox": "node test/browser/firefox-first-click.mjs",
```
```js
// biome-ignore-all lint/correctness/noNodejsModules: opt-in end-to-end test launches local Vite and Chrome
```
```js
// Requires `npx playwright install firefox`; run headed under Xvfb or a desktop display.
```

Why it matters: two harnesses, two drivers (Chrome via CDP with pointer lock **stubbed**: `Object.defineProperty(document, 'pointerLockElement', …)`; Firefox via Playwright with real pointer lock), no shared scenario code. Before #63 the inventory drag/drop contract existed only in the Chrome harness; CI was green while drag/drop was broken in Firefox, which DESIGN.md names the reference (*"running Firefox on Linux"*). The Chrome harness was green partly because its `moveCursorTo` fed synthetic `mousemove` events into the very code path that Firefox broke on. The fix re-implemented the scenario a second time (+127 lines) in the Firefox file, and #43's "fix merged audio checks" had to touch both. Planned: the inventory lit-html port changes this path again; ADR 0002 step 4 requires *"browser tests cover each trigger, refresh/resume, both backends"*.

Remedy: one Playwright harness parameterised by browser (`chromium`, `firefox`), scenarios as a shared array of `{ name, run(page) }`; keep the CDP script only if something Playwright can't drive is needed (nothing found). Run Firefox for every scenario, Chromium as the second.

Verification: subagent confirmed the split, the pre-fix coverage gap (`git show 1dcda05^:…firefox-first-click.mjs` has no drag/drop/inventory), and the duplication.

## C. Knowledge at risk

### Docs and code disagree

| Doc says | Code says |
| --- | --- |
| DESIGN.md, scheduler table: *"Active AI \| 10 Hz"* | play.ts: `sim.scheduler.register({ id: 'zombies', rate: 20, …` (snapshot.test.ts and the bench also use 20) |
| DESIGN.md, Combat: *"Hit detection is a swept sphere cast from the camera against entities."* | zombies.ts `swing`: one point at `body.height * 0.55`, reject if `perpendicular * blockSize > 0.65` or `raycast(…)` blocks it, nearest along the ray wins (SLICE-1 1.8.5 describes the code correctly) |
| SLICE-1.md 1.10: *"Their files go in `assets/sounds/` and are listed in the asset manifest."* | Files are under `src/content/base/assets/audio/` and the fingerprint allowlist is `'../content/base/assets/audio/**/*.ogg'` |
| PROJECT.md, Block entities: *"E opens and closes the door or searches the container in the crosshair."* (also SLICE-1 1.5) | input.ts: `if (code === 'KeyF') { return 'interact'; }`; index.html: `<dt>F</dt><dd>Open or close a door, search furniture</dd>` |
| PROJECT.md, Simulation: *"The pause card (Esc) pauses the simulation"* | input.ts: `mainMenu: { code: 'F9', label: 'F9', … }`; index.html: `<dt>Escape</dt><dd>Release the mouse (browser control)</dd>` |
| PROJECT.md, Known limits: *"Fatigue only rises: sleep arrives in 1.8."* | `game/rest.ts`, R/L keys, `RestController` (PR #41) |
| PROJECT.md, Known limits: *"Shamblers' spawn marks in templates are left as air; nothing spawns yet (1.7)."* | `core/zombieSpawns.ts`, `hamletZombieSpawns` (`rng.int(6, 10)`) |
| PROJECT.md, Known limits: *"Nothing is saved yet"* | Snapshot, canonical format, version identity and fingerprint exist (PRs #48, #50, #56, #62); only storage is missing |
| PROJECT.md `?debug=1` list: B, T, N, U, K, G | SLICE-1 1.7 adds H (god mode) and F (noclip); #43 adds F9 audio settings; the debug panel lives in `src/debug/index.ts` |
| PROJECT.md `?bench=1` only | SLICE-1 1.7: `?bench=shamblers&n=…` |
| PROJECT.md has **no mention** of the save fingerprint or ADR 0002 (grep: 0 hits) | Every edit to a `SIMULATION_ENTRIES` module changes save identity |

Line references in docs (`src/core/zombies.ts:57`, `:1025`, `saveState.ts:153`) are all still correct today, but they will rot on the next edit to those files; prefer symbol names (`Zombie.health`, `ZombieSystem.swing`, `restoreWorldDiffs`).

### Facts that exist only in code

- Fists: `FISTS_MELEE = { damage: 8, reach: 0.7, cooldown: 0.8, stamina: 4 }` (SLICE-1's tunables table has no fists row).
- Melee hit volume: 0.65 m radius cylinder around a point at 0.55 of height; `melee_swing` sound is emitted on every swing including misses; a hit also emits `melee_hit` and `shambler_hurt`.
- Player vocal noise lives 0.5 s: `expiresAt: time + 0.5`.
- Daylight for perception: `isDaylight = (hour) => hour >= 6.5 && hour < 19.5` (DESIGN gives only "darkest 23:00 to 03:30").
- Zombie loot is rolled on death from `sim.rng(\`zombie-loot:${zombie.body.pos.join(',')}\`)` — keyed by death position, so two deaths at one spot re-roll identically.
- Frame delta is clamped: `const dt = Math.min(0.1, (now - last) / 1000)`; zombie render interpolation `zombieAlpha = … (sim.time - lastZombieStep) * 20` couples to the 20 Hz rate.
- Units convention: core APIs take blocks, constants and content are metres; play.ts converts with `* s` / `/ s` at every boundary (`playWorldSound` multiplies positions by `s`; `LOOT_REACH / s`; `CHEST / s`). `ZombieSystemOptions.jumpSpeed` is metres/s and is divided by `blockSize` inside; the type says only `number`.
- Zombie collision body is `1.7 / blockSize` tall, independent of `FIGURE_BOXES`.
- Compression unsafe rule: `zombie.mode === 'chase' || horizontalDistance(...) * blockSize <= 30` (matches SLICE-1's 30 m).
- `Continue` is not implemented; `sim.paused` is literally "the overlay is visible".

## D. What a coding agent with no context would get wrong

1. **Bind E and Esc** from PROJECT.md's prose; the truth is `input.ts` and the controls card in `index.html`. Prevent: fix the PROJECT.md rows in C, or generate the controls list from `KEY_BINDINGS`/`worldActionForKey` (index.html already does this for `data-key-binding="mainMenu"`).
2. **Make a "UI-only" change in play.ts** (a notice, a HUD line, a pointer tweak) without knowing it changes the save identity. PROJECT.md never mentions the fingerprint; only ADR 0002 and `tools/simulationFingerprint.ts` do. Prevent: a "Saves" row in PROJECT.md's Decisions table naming `SIMULATION_ENTRIES`/`SIMULATION_EXCLUSIONS` and the rule "presentation goes in an excluded module"; B1 reduces the blast radius.
3. **Write a sixth `new ZombieSystem({...})` wiring** for a new test, copying `jumpSpeed`/facing/hooks by hand — the existing copies already disagree (B2). Prevent: B2's `session.ts`; until then, a comment on `ZombieSystemOptions.jumpSpeed` saying "metres per second".
4. **Add a field to `Zombie` for 1.8.5** and touch only the interface. The path is: `Zombie` interface → `ZombieState` (`Omit<Zombie, …>`) → `snapshotState()` spread → `saveFormat.ts` `zombie = obj({...})` (encode throws `Unknown field` otherwise) → `restoreState` validation (selective; add a range check) → `inspect()` in snapshot.test.ts (already spreads all fields). Prevent: a short "adding simulation state" checklist in ADR 0002's Consequences (it already states the obligation, not the steps).
5. **Put OPFS/IndexedDB code in `src/core/storage.ts`** because the name suggests it — that file is chunk memory statistics. Prevent: A2 (denied globals in core) and a one-line rename or header note; the ADR says the storage layer is worker-side.
6. **Reach for Valibot for the save schema** (the content schemas use it) and lose the exact-field/canonical-number guarantees the hand-rolled `obj()/finite/safeInt` DSL in `saveFormat.ts` provides. Prevent: one sentence at the top of `saveFormat.ts` saying why it isn't Valibot.
7. **Mix blocks and metres** at a new boundary (the `jumpSpeed` bug in the test is the live example). Prevent: the units line under C in PROJECT.md's Scale row, and typed helpers (`metresToBlocks`) at the play.ts boundary.
8. **Run `npx biome`** — root README already warns; keep.
9. **Assume Chrome green means it works** — the reference browser is Firefox and the Chrome harness stubs pointer lock (B5).

## E. Method notes

- **"Next few commits" misfired** because `main` is merge-only; first-parent neighbours are unrelated PRs. What worked: branch-internal commit titles ("fix merged…", "…after main merge"), the same branch name merged twice (#56/#62), and `-fix` PR titles. PR bodies are empty, so causes had to be reconstructed from diffs.
- **Past-cost evidence is thin by construction**: the whole deadvox history is 4 days and 25 PRs, so churn is feature size, not maintenance. The "every finding needs a past cost or planned change" rule was satisfiable only because SLICE-1.md and ADR 0002 spell out the next changes in detail; on a repo with weaker planning docs, step 2 would have had little to trace.
- **Lifespan was easy to derive** (EPIC's slice process), but the choice "will evolve" made step 4 the larger half of the work: the docs are 3,200 lines plus a 489-line ADR, and SLICE-1.md (1,106 lines) exceeded the single-read cap. Most of the knowledge findings came from PROJECT.md, which says *"This file describes the code as it is"* and is the most stale of the set.
- **Finding cap of 8 was not binding** (5 found). Two candidates were folded elsewhere: `saveFormat.ts`'s five complexity waivers (stable, no planned change touches them beyond adding fields) and `ZombieSystem.swing`'s inline damage/death (clean single site; 1.8.5 is the change itself, not a maintainability issue).
- **The Boundaries input was moot**: no sibling imports exist; A1 pins that.
- **Environment limits**: `node` is not on the bash PATH and root `node_modules` is absent, so Biome option shapes in A1/A2/A4 are from memory of Biome 2.x, not the installed schema. Flagged in A.
- **Refutation subagents** all returned STANDS, and two of them added evidence I had not found (the `jumpSpeed` units bug and why the Chrome harness stayed green). Worth keeping in the method; the cost was ~5 minutes wall-clock in parallel.
