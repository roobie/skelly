---
id: skelly::deadvox-interface
description: Design for what the game's interface may show and say to the player, how far it is diegetic, and how development builds are allowed to break that
read_if:
  - you're deciding what the interface may tell the player and in what voice
  - you're changing player-facing prompts, feedback, or HUD language
  - you're changing debug-profile hit feedback, shot-trajectory tools, or target-range readouts
  - you're changing how playtesters hand back metrics or replays
  - you're changing UI layer order, overlay stacking, or native controls under the drawn cursor
tags: [deadvox, design, ui, ux, diegesis, hud]
created: 2026-09-27
status: active
---

# deadvox — interface

What the player sees and reads besides the world itself: the HUD, menus,
screens, cursors, prompts and feedback. [INTERACTIONS.md](INTERACTIONS.md) says
how the UI and the core divide the work; this document says **what the interface
may tell the player, and in what voice**. Read it with:

- [DESIGN.md](DESIGN.md): "Hands: what you see is what's there", "UI principles",
  "Audio" and "Dread".
- [INTERACTIONS.md](INTERACTIONS.md): the UI contract.
- [ADR 0001](docs/decisions/0001-ui-rendering-with-lit-html.md): screens are
  lit-html.

[[THIS is_grounded_by: DESIGN.md]]
[[THIS is_grounded_by: INTERACTIONS.md]]
[[THIS is_grounded_by: docs/decisions/0001-ui-rendering-with-lit-html.md]]
**Status:** active. The shipped interface favors information carried by the
world, the character's body and held items; development-only instructions remain
separate from the shipped profile.

## The goal

**The shipped game is as diegetic as it can be.** What the player knows comes
from the world, their body and their hands: what they see, hear and hold, and how
their character feels. The interface adds as little as it can, and says nothing
the world could have shown.

**Development breaks that on purpose, all the time.** Debug readouts, key
legends, instructional hints and test controls are how the game gets built and
playtested. They are allowed, as long as they're **labelled as development** and
**removable by one switch**, never woven into the shipped interface. The rules
below exist so that turning development off leaves a clean game, not a pile of
text to hunt down.

## Four kinds of interface element

Every element on screen is one of these (the usual game-design split, used here
as a checklist):

| Kind | Lives in | Example | Shipped game |
|---|---|---|---|
| **Diegetic** | the world, visible to the character | the flashlight's beam, a note, a door's state, the item in your hands | preferred |
| **Bodily** | the character's senses and body | the damage vignette and tilt, blurred vision when exhausted, heavy breathing | allowed, and preferred over a number |
| **Spatial** | drawn in the world but not part of it | an outline on the thing you look at | only where the world can't carry it |
| **Meta** | over the screen, outside the world | the inventory grid, the main menu, a clock readout | HUD elements start enabled and can be turned off individually |

A new element names its kind in its view model's comment, and the pull request
that adds it says why the kind above it wasn't enough.

## Bodily cues: the body tells, the HUD doesn't

**The damage vignette is the reference example.** A hit shows as a red edge
and a quick tilt of the view, scaled by
how hard it was, gone within a second. There's no number and no text, and the
player still knows exactly what happened and roughly how bad it was. Every need
and bodily state gets cues of that kind, **seen and heard**, so the HUD stats
can become an option nobody needs.

The rules for a cue:

- **It scales with severity.** Faint and rare when a need starts to bite,
  stronger and more frequent as it becomes critical. A player learns the scale by
  living with it.
- **It's short and it fades.** Like the vignette: a moment, then gone. A cue that
  stays on screen is a HUD element.
- **Sound cues are the character's own sounds,** positioned at the player.
  Whether one also emits a simulation noise event is a separate hearing policy.
- **It never spams.** Each cue has a minimum interval that shrinks with severity,
  and two cues don't start in the same second.
- **It's tunable data** (thresholds, intervals, strengths) in the content pack,
  like the other tunables, and judged by BR in game.

Cues per state (a starting set; the sound column is BR's choice):

| State | Seen | Heard |
|---|---|---|
| Damage | red edge vignette, quick tilt (done) | a grunt or gasp |
| Hunger | a short weak sway when it's bad | stomach gurgle |
| Thirst | a dry, washed-out edge when it's bad | lip smacking, a dry swallow |
| Fatigue | slow blinks (the view darkening and returning), heavier head bob | yawning |
| Low health, pain | desaturation and a slower view settle | moaning, pained breathing |
| Injured leg | a limp: an uneven head bob, one step short and dipping, at a slower pace | uneven footsteps, a hiss on the bad step |
| Low stamina | a pulse of narrowed view after a sprint | panting, heavy breathing |
| Illness (food poisoning) | a nauseous drift of the view | coughing, retching |
| Refusal or interruption | reason text on the world prompt, rest card and craft status box only when messages are on | the avatar's “nope” sound for refusals, regardless of messages/hints; not heard by shamblers |

The refusal sound is player-only presentation and emits no simulation noise.
See `src/game/play.ts`, `showRefusal`, and
`src/game/audioPresentation.ts`, `createRefusalPresenter`.

The limp is also movement, not only a look: the pace really drops, so it belongs
with the body model, which tracks wounds per body part (`src/core/body.ts`,
`BodyWounds`). The limp comes with fractures (#277).

Web Audio starts on the first click, as DESIGN.md says. Sounds are content ids
in the pack, validated and credited in the asset manifest. The refusal cue is a
player-only exception to simulation noise: it does not alert shamblers.

## Afford, don't instruct

**The interface shows what can be done; it doesn't write out how.** An empty
quickbar slot looks like an empty slot (a numbered, empty frame); dragging an
item onto it is something the inventory makes obvious by allowing it. The words
"set it in the inventory" are an instruction, and an instruction means the
affordance failed.

Text on screen falls into four classes, and only three of them ship:

1. **World text:** notes, signs, labels on tins, the radio. Diegetic, and ships.
2. **Names and facts the character knows:** an item's name, its weight when you
   heft it. Ships, on the meta surfaces that need them (the inventory).
3. **The character's voice, when something is refused or noticed:** "You're not
   tired", "Something's in the way", "You hear something outside". Short, first
   person, about the world, never about keys or menus. Ships. Class-3 reason
   text on the world prompt, rest
   card and craft status box follows the same `hudVisibility` projection from
   `src/ui/hudOptions.ts`; it appears only when the `messages` option is on. See
   `src/ui/playHud.ts`, `playPromptText`, `src/ui/rest.ts`, `restViewModel`, and
   `src/ui/craftReadout.ts`, `craftStatus`. With it off, the avatar's nope sound
   is the refusal cue; see
   `src/game/play.ts`, `showRefusal`.
4. **Instructions:** anything naming a key, a click, a menu or a procedure
   ("press R", "open the inventory", "Enter: continue"). **Development only.**

### How it's encoded

A rule that lives only in prose gets broken the next time someone is in a hurry,
so class 4 is to be made mechanical. Only part of the key-name rule is built; the
rest, the hint channel, its profile and its guard test are planned work, "Order
of work" item 2.

- **Key names come from the bindings (partly built).** The HUD lines, the
  inventory screen and the rest card read key labels from the binding registry,
  so a rebinding can't leave a stale "press E" behind; see
  `src/game/inputBindings.ts`, `labelForAction`. Two places still name keys
  directly: the how-to-hear lines on the listening sheet (`src/ui/soundGuide.ts`,
  shown on `sounds.html`, a build input the main menu links), and the throw
  readout in `src/game/play.ts`.
- **One hint channel (planned).** Every instruction becomes an entry in one table
  of hints (id, text, the binding it names), shown through one function. Nothing
  else in the UI may then name a key or give a procedure. Until it exists,
  instructions sit in the UI modules that show them. Most sit behind the player's
  `interaction` and `messages` HUD options (`src/ui/hudOptions.ts`,
  `hudVisibility`), but the inventory help line (`src/ui/inventoryScreen.ts`, the
  `inv-help` span) and the rest card's stop hint (`src/ui/rest.ts`,
  `restViewModel`) show regardless of them.
- **A profile decides whether hints show (planned).** Development and playtest
  builds show hints; the shipped profile doesn't. A first-run tutorial, if the
  game gets one, is a *diegetic* problem to solve first (a note, a radio
  message), and hints only as a fallback.
- **A guard test enforces it (planned),** like `test/uiLitHtml.test.ts` does for
  ADR 0001. Templates and view models under `src/ui` may not contain key names
  or instruction phrasing outside the hint table. Anything in `src/debug` is
  exempt, since none of it ships.
- **Review asks one question:** could the player learn this from the world or
  their hands? If yes, the text goes.

## Readying before acting (#267; Slice 3.1)

**Combat is modal, as in DayZ.** Holding a weapon is not the same as being
ready to use it.
Firearms fire only while ready and never while sprinting; ready movement stacks
with crouch pace. Firearms combat governs ready movement and related handling;
melee combat governs block success. The tiered practice contract is in
[SLICE-3.md](SLICE-3.md), 3.1.

- **Right mouse sets the combat stance:** holding it raises a melee weapon into
  en-garde, and releasing it lowers the weapon. It also readies a firearm for hip fire; releasing it lowers the stance. The
  firearm's held pose shows readiness without a HUD indicator, with the muzzle
  lowered when unready and forward when raised. Partial raise progress is saved
  with the firearm because it changes when that weapon can shoot; held input is
  transient.
- **ADS is a toggle inside a fully raised firearm stance,** for iron sights and
  optics. It is not a separate HUD mode. The `aim.ads-toggle` action can be
  rebound to a mouse button or key; both it and the held ready action share the
  pointer/keyboard binding registry, which holds their defaults. In optic ADS, an ocular
  window shows the unmagnified scene instead of a pipe view down the tube; the
  aperture fill is content-tuned from exported ocular geometry. The later
  magnification and blurred surround remain in 3.7. See
  `src/game/inputBindings.ts`, `BindingRegistry`, and `src/render/hands.ts`,
  `HeldItems.updateOpticWindow`.
- **Melee also requires readiness:** en-garde is the held melee stance; a swing
  outside it does not start. See `src/game/play.ts`, `updateHeldItems`, for the
  pose path.
- **Blocking:** en-garde alone does not block; backing off is also required, and
  the attempt succeeds according to melee-combat skill. `src/game/melee.ts`,
  `shouldBlockFromEnGarde`, owns the stance gate.
- **Unready firearm left-click is an exception to refusal:** it produces no shot
  and no nope sound; this deliberate no-op does not use the ordinary refusal cue.
- **Hand activation follows actor roles:** dominance is
  identity, not a remapping of physical inventory slots. A held item cannot
  become an unarmed attack, and a two-handed hold's support must not activate
  the other hand's item. See `src/game/inputBindings.ts`, `INPUT_BINDINGS` and `POINTER_ACTIONS`, and
  `src/game/primaryAction.ts`, `selectPrimaryAction`, for bindings and admission.
  The native creation choice precedes gameplay construction; Continue restores
  identity rather than consulting creation preferences. See
  `docs/character-handedness.md` for the accepted-launch and physical-pose
  boundaries.
- Lowered, a held item may block part of the view; its firearm pose rises with
  simulation-time readiness, as shown by `src/render/hands.ts`, `HeldItems.update`.

## HUD

The optional Handling progress HUD reuses its existing progress card for a held
item throw. Its fill follows throw charge in simulation time; a labelled marker
shows the minimum-release point. The meter appears only while `handling` is on, T is held, and the throw is
charging; it is absent while a throw waits for a handling job to finish. It
vanishes on release or cancellation, so the player can read force without a
second widget or key instruction. See `src/ui/hud.ts`,
`handlingViewModel`, and `src/game/play.ts`, `handlingPresentationFor`.

A recipe book's progress is meta information embedded in the paper view, not an
optional HUD line. The readable text cannot show how long a compressed action has
left, and the player needs that endpoint even with every HUD option off. The
meter is shown only while the book is open; closing it pauses the action and
keeps its progress. See `src/ui/reading.ts`, `ReadingProgress` and `mountReading`.

## Development and playtest

- **`?debug=1` is the development profile.** Its panel, readouts and tools live in
  `src/debug` and load only there. They can say anything. The target ping and the
  impact laser (`debug.impact-laser` in `src/game/inputBindings.ts`,
  `INPUT_BINDINGS`) are debug-profile tools; see `src/game/worldSetup.ts`,
  `DebugTestHouseSite`, `src/debug/index.ts`, `createDebugActions`, and
  `src/render/impactEffects.ts`, `ImpactEffects`. The target-range readout sits
  beside the gizmo in `src/debug/index.ts`, `attachDebugTools`. Shots follow the visible firearm's
  bore plus spread, while the optional crosshair reports where that bore line
  meets the world. The mark follows a wielded firearm's bore at its raise
  progress and disappears when its projected point leaves the viewport. The
  mark turns with the rifle during a rack or magazine job; see
  `src/render/handlingTurn.ts`, `handlingRotation`.
  `src/game/firearmAim.ts`, `firearmBoreRay` and
  `firearmBoreTarget`, share the shot ray and its reported hit; the crosshair
  itself is projected by `src/ui/playHud.ts`, `projectCrosshairScreenPosition`.
  The firearm's ready pose uses the melee-ready hand placement without its wrist
  rotation, so the gun keeps its own angle; see `src/core/heldPose.ts`,
  `readyFirearmPose`.
  A separate X at screen centre lives in `src/debug/index.ts`, apart from
  the optional crosshair. In ADS the undeviated sight aligns to the fixed view;
  recoil and handling then move the firearm, its optic window and its bore
  together, and the optional crosshair reports that bore rather than random
  spread. `src/core/heldPose.ts`, `heldFirearmTransform`, is shared by
  `HeldItems.update` and `heldFirearmBore`. The intentional over-limit pitch shift
  still moves the view through `src/game/session.ts`, `applyAimViewPitchShift`
  (`controls.adjustPitch`). The looked-at tooltip still stops at solid geometry, matching shot occlusion;
  `src/debug/lookedAt.ts`, `describeLookedAt`, uses the solid-world query.
- **Playtests need hints but not debug tools (planned, "Order of work" item 3).**
  A playtest profile (a URL flag, not a build) is to show the hint channel and
  nothing from `src/debug`, so a tester sees the game close to how it ships, with
  the instructions it still needs. No such flag exists yet: `src/game/config.ts`,
  `configFromUrl`, reads none.
- **The shipped profile** shows no debug and starts with its HUD elements on;
  each can be turned off individually. New players need the HUD to understand
  the game, while experienced players can hide elements as diegetic affordances
  grow. See `src/ui/hudOptions.ts`, `DEFAULT_HUD_OPTIONS`. The inventory help line
  and the rest card's stop hint ignore those options ("How it's encoded"). The
  crosshair follows its HUD option; a separate center X is part of `?debug=1` and
  never ships.

## UI layers

UI layers come from ordered custom properties in `src/ui/style.css`, `:root`; inline styles use the same tokens. The drag ghost stays above the inventory and crafting panels. `#game-cursor-root` tops ordinary layers because it is the only pointer while pointer lock is held with a menu, inventory or page open; `src/ui/menuPointer.ts`, `mountMenuPointer`, forwards clicks at its position, so a higher layer would hide where the player points. Forwarded synthetic clicks cannot open a native select's popup, so `mountMenuPointer` opens its picker during the trusted click instead. The startup screen is a boot curtain, and the debug review map (`src/game/play.ts`, `toggleReviewMap`) may cover the cursor because neither uses it: play takes pointer lock after startup, and opening the map unlocks input.

## Where the current interface stands

| Element | Kind now | Target | Gap |
|---|---|---|---|
| HUD stats (health, food, fatigue…) | meta, on by default; individually toggleable | bodily | the cues in "Bodily cues" may eventually let players hide stats they no longer need |
| Clock readout | meta, on by default; individually toggleable | diegetic | a watch, when you look at your wrist or hold one |
| Crosshair | meta, on by default; individually toggleable | none | the aiming aid can be hidden when the player's sights and the world suffice |
| Interaction hints ("looking at…", "F: open") | meta, on by default; individually toggleable | spatial | a faint outline on the one usable thing you look at within reach; no text, no key name |
| Quickbar | meta, on by default; individually toggleable | meta | fine as a frame of slots; no instructional text |
| Damage vignette and tilt | bodily | bodily | shipped as it is |
| Rest and sleep screen | meta | bodily plus meta | the spinning clock and edge darkening can stay; the stop hint is built by `src/ui/rest.ts`, `stopHint` |
| Interruption prompt | meta, instruction | meta, choice | `src/ui/rest.ts`, `restTemplate`, offers Stop only when the action can be cancelled; its key names come from the bindings, and it moves to the hint channel with "Order of work" item 2 |
| Main menu (F9) | meta | meta | fine; settings, help and the playtest hand-back live here |
| Inventory screen | meta | meta | grids stay; numbers per DESIGN.md "numbers are there when you look" |
| Refusal notices ("Quickbar 1 is empty") | voice | voice | none: they name no key or procedure (`src/game/play.ts`, `showRefusal`) |
| Drawn menu cursor | meta | meta | fine |

## Numbers and diegesis

Numbers are available on request, on meta surfaces the player opens (such as an
item inspection or inventory), and are not pushed during play. This keeps
simulation facts accessible without undermining diegesis.

## Interface decisions

1. **Crosshair:** the aiming reticle is on by default, and its HUD option can
   turn it off. Weapon sights still support aiming without it; hip fire and melee
   do not require a reticle.
2. **Interaction affordance:** a subtle outline on the one usable thing in reach;
   no text or key name.
3. **Numbers:** available on request through meta surfaces, not pushed at the
   player during play.
4. **Onboarding:** the shipped first run gets a diegetic introduction, shaped by
   where playtesters get stuck. HUD hints start on and can be turned off
   individually in the F9 menu.
5. **Playtest profile:** `?playtest=1` is to turn on the hint channel and load
   nothing from `src/debug` ("Order of work" item 3). Testers hand back their
   metrics and recent replay from the F9 menu, never through `?debug=1`: debug's
   god mode, spawning, noclip and time controls would taint what the playtest
   observes. The menu and the debug panel build the same files (see
   `src/game/playtestTools.ts`, `metricsFile` and `replayFile`).
6. **Character sounds:** vocal pain and strain sounds are noise events with a
   radius in data, so BR can judge their effect in play and tune or disable them.
   Variation comes from random but curated picks for the events we have.
7. **Ready-firearm crosshair:** the optional mark reports where the bore line
   meets the world, not the random spread, and does not steer the shot. With
   `?debug=1`, a separate X marks screen centre. During a rack or magazine job,
   the mark follows the turned muzzle.

## Order of work

1. Add the spatial outline for the one usable thing within reach.
2. Build the hint channel ("How it's encoded"): the hint table and its one
   function, the profile that decides whether hints show, and the guard test.
   Then move the instructions the UI modules show into the table, including the
   interruption prompt, the ones that ignore the HUD options and the ones that
   still name keys directly.
3. Add the playtest profile, `?playtest=1` ("Development and playtest").
4. Shape the diegetic first-run introduction from playtest findings.
5. Make the clock diegetic through a watch the player can inspect or hold.
6. Develop bodily cues one state at a time; retire a HUD line only after BR has
   judged its replacement cue in play.
