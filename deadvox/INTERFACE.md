---
id: skelly::deadvox-interface
description: Design for what the game's interface may show and say to the player, how far it is diegetic, and how development builds are allowed to break that
read_if:
  - you're deciding what the interface may tell the player and in what voice
  - you're changing player-facing prompts, feedback, or HUD language
  - you're changing debug-profile hit feedback, shot-trajectory tools, or target-range readouts
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
| **Meta** | over the screen, outside the world | the inventory grid, the main menu, a clock readout | minimal, opt-in, off by default |

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
  like the other tunables, and tuned by BR in game.

Cues per state (initial set; sound column):

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
with the body model. Wounds per body part come in Slice 3 ([EPIC.md](EPIC.md#3-flesh-and-noise));
until then a limp can follow low health.

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
so class 4 is made mechanical:

- **One hint channel.** Every instruction is an entry in one table of hints
  (id, text, the binding it names), shown through one function. Nothing else in
  the UI may name a key or give a procedure.
- **Key names come from the bindings.** A hint that mentions a key reads its
  label from the key-binding table, so a rebinding can't leave a stale "press E"
  behind (as the swap of E to F nearly did).
- **A profile decides whether hints show.** Development and playtest builds show
  hints; the shipped profile doesn't. A first-run tutorial, if the game gets one,
  is a *diegetic* problem to solve first (a note, a radio message), and hints
  only as a fallback.
- **A guard test enforces it,** like `test/uiLitHtml.test.ts` does for ADR 0001.
  Templates and view models under `src/ui` may not contain key names
  (`Key[A-Z]`, `Digit`, "press", "click", "Tab", "F9" and so on) or
  instruction phrasing outside the hint table. Anything in `src/debug` is exempt,
  since none of it ships.
- **Review asks one question:** could the player learn this from the world or
  their hands? If yes, the text goes.

## Readying before acting (#267; Slice 3.1)

**Combat is modal.** Holding a weapon is not the same as being ready to use it.
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
  optics. It is not a separate HUD mode. The `aim.ads-toggle` action defaults to
  mouse-3 and can be rebound to a mouse button or key; both it and the held ready
  action share the pointer/keyboard binding registry. In optic ADS, an ocular
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

## Development and playtest

- **`?debug=1` is the development profile.** Its panel, readouts and tools live in
  `src/debug` and load only there (ui.2's split). They can say anything. The
  target ping and F2+L laser are debug-profile tools; see `src/game/worldSetup.ts`,
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
  The firearm's ready pose keeps the wrist rotation on the hand rather than
  shifting the gun angle; `src/core/heldPose.ts`, `readyFirearmPose`, retains
  the hand placement.
  A separate X at screen centre lives in `src/debug/index.ts`, apart from
  the optional crosshair. In ADS the undeviated sight aligns to the fixed view;
  recoil and handling then move the firearm, its optic window and its bore
  together, and the optional crosshair reports that bore rather than random
  spread. `src/core/heldPose.ts`, `heldFirearmTransform`, is shared by
  `HeldItems.update` and `heldFirearmBore`. The intentional over-limit pitch shift
  still moves the view through `src/game/session.ts`, `applyAimViewPitchShift`
  (`controls.adjustPitch`). The looked-at tooltip still stops at solid geometry, matching shot occlusion;
  `src/debug/lookedAt.ts`, `describeLookedAt`, uses the solid-world query.
- **Playtests need hints but not debug tools.** A playtest profile (a URL flag, not
  a build) shows the hint channel and nothing from `src/debug`, so a tester sees
  the game close to how it ships, with the instructions it still needs.
- **The shipped profile** shows no hints and no debug, and its HUD defaults are
  empty (as ui.1 already made them). The optional crosshair remains development-only;
  the debug center X is part of `?debug=1` and never ships.

## Where the current interface stands

| Element | Kind now | Target | Gap |
|---|---|---|---|
| HUD stats (health, food, fatigue…) | meta, opt-in | bodily | the cues in "Bodily cues"; the opt-in stays for development |
| Clock readout | meta, opt-in | diegetic | a watch, when you look at your wrist or hold one |
| Crosshair | meta, opt-in | none | shipped: none, ever; the optional development mark follows a wielded firearm's bore at its current raise progress, disappearing when its projected point leaves the viewport |
| Interaction hints ("looking at…", "F: open") | meta, opt-in | spatial | a faint outline on the one usable thing you look at within reach; no text, no key name |
| Quickbar | meta, opt-in | meta | fine as a frame of slots; no instructional text (the fix just requested) |
| Damage vignette and tilt | bodily | bodily | shipped as it is |
| Rest and sleep screen | meta | bodily plus meta | the spinning clock and edge darkening can stay; the stop hint is built by `src/ui/rest.ts`, `stopHint` |
| Interruption prompt | meta, instruction | meta, choice | `src/ui/rest.ts`, `restTemplate`, offers Stop only when the action can be cancelled; key names come from the hint channel |
| Main menu (F9) | meta | meta | fine; settings and help live here |
| Inventory screen | meta | meta | grids stay; numbers per DESIGN.md "numbers are there when you look" |
| Notices ("Quickbar 1 is empty: open the inventory…") | mixed | voice | keep the voice part, move the procedure to the hint channel |
| Drawn menu cursor | meta | meta | fine |

## Numbers and diegesis

Numbers are available on request, on meta surfaces the player opens (such as an
item inspection or inventory), and are not pushed during play. This keeps
simulation facts accessible without undermining diegesis.

## Interface decisions

1. **Crosshair:** none in the shipped game. Aiming uses the weapon's own sights;
   hip fire and melee have no reticle. The opt-in dot remains development-only.
2. **Interaction affordance:** a subtle outline on the one usable thing in reach;
   no text or key name.
3. **Numbers:** available on request through meta surfaces, not pushed at the
   player during play.
4. **Onboarding:** the shipped first run gets a diegetic introduction, shaped by
   where playtesters get stuck. Hints remain an off-by-default fallback in the
   F9 menu.
5. **Playtest profile:** `?playtest=1` turns on the hint channel and loads nothing
   from `src/debug`.
6. **Character sounds:** vocal pain and strain sounds are noise events with a
   radius in data, so BR can judge their effect in play and tune or disable them.
7. **Ready-firearm crosshair:** the optional mark reports where the bore line
   meets the world, not the random spread, and does not steer the shot. With
   `?debug=1`, a separate X marks screen centre. During a rack or magazine job,
   the mark follows the turned muzzle.

## Order of work

1. Keep the hint channel, bindings-sourced key labels and guard test in place.
2. Move instructional strings into the hint table.
3. Keep the playtest profile separate from debug tools.
4. Maintain the player-sound system with Web Audio and content-owned CC0 sources.
5. Develop bodily cues one state at a time; retire a HUD line only after BR has
   judged its replacement cue in play.
