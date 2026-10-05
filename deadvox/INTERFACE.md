---
id: skelly::deadvox-interface
description: Design for what the game's interface may show and say to the player, how far it is diegetic, and how development builds are allowed to break that
read_if:
  - you're deciding what the interface may tell the player and in what voice
  - you're changing player-facing prompts, feedback, or HUD language
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
**Status:** active. The rules below come from BR's direction on 2026-09-27: "the
end state should be as diegetic as possible", and the quickbar's "set it in the
inventory" is the kind of thing that should be afforded, not typed out. BR ruled
on the open questions on 2026-09-28; the rulings are at the end.

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

**The damage vignette is the reference example** (BR, 2026-09-27: "good diegetic
affordance"). A hit shows as a red edge and a quick tilt of the view, scaled by
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

Cues per state (a starting set; BR's list is the sound column):

| State | Seen | Heard |
|---|---|---|
| Damage | red edge vignette, quick tilt (done) | a grunt or gasp |
| Hunger | a short weak sway when it's bad | stomach gurgle |
| Thirst | a dry, washed-out edge when it's bad | lip smacking, a dry swallow |
| Fatigue | slow blinks (the view darkening and returning), heavier head bob | yawning |
| Low health, pain | desaturation and a slower view settle | moaning, pained breathing |
| Injured leg (BR: "limping too!") | a limp: an uneven head bob, one step short and dipping, at a slower pace | uneven footsteps, a hiss on the bad step |
| Low stamina | a pulse of narrowed view after a sprint | panting, heavy breathing |
| Illness (food poisoning) | a nauseous drift of the view | coughing, retching |
| Refusal or interruption | reason text on the world prompt, rest card and craft status box only when messages are on | the avatar's “nope” sound for refusals, regardless of messages/hints; not heard by shamblers |

BR's 2026-10-05 11:31 direction: “i've added nope1_clean.wav / it's the diegetic sound (the avatar makes a nope sound) for when something doesn't work (when UI is off, and any hints are hidden)”. BR's 11:32 answer was “i recorded it myself 10 minutes ago / yes, CC0” and “no, this one is not heard by shamblers (but if it were a multiplayer game, it'd be heard by other players)”. The 11:46 ruling quoted under class 3 requires the sound regardless of whether messages/hints are on. See `src/game/play.ts`, `showRefusal`, and `src/game/audioPresentation.ts`, `createRefusalPresenter`: the cue is player-only presentation and does not emit a simulation noise event.

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
   person, about the world, never about keys or menus. Ships. BR ruled on
   2026-10-05: "our overarching goal is: diegesis / which means 0 synthetic UI
   elements / this cannot hold for exactly 100% of the time / but it does mean /
   if the checkbox for messages/hints is off ,then no messages or hints should
   come from a syntheitic UI element / but the 'nope' sound shall play regardless
   of UI hints being on or off". Class-3 reason text on the world prompt, rest
   card and craft status box follows the same `hudVisibility` projection from
   `src/ui/hudOptions.ts`; it appears only when the `messages` option is on. See
   `src/ui/playHud.ts`, `playPromptText`, `src/ui/rest.ts`, `restViewModel`, and
   `src/ui/craftReadout.ts`, `craftStatus`. With it off, the avatar's nope sound
   is the refusal cue; see
   `src/game/play.ts`, `showRefusal`.
4. **Instructions:** anything naming a key, a click, a menu or a procedure
   ("press R", "open the inventory", "C: continue"). **Development only.**

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

## Readying before acting (BR, 2026-09-27; refined by #267)

**Combat is modal, as in DayZ.** Holding a weapon is not the same as being ready
to use it. BR's 2026-10-05 direction for #267 was:

> "well, at some point, we should make it like dayz in that you don't run around ready to fire by default. Instead it's modal such that gun ready is e.g. press-and-hold rightbutton, and only then can you fire/attack"
>
> "and by that, I mean that you never fire while sprinting, but instead when holding right mouse, you 'duck walk' (which also can be a skill-dependent thing in that you duck walk faster with higher skill)"

When #267 lands, firearms fire only while ready and never while sprinting;
ready movement is a skill-dependent duck walk, a separate gait from C crouch
and mainly a speed factor. BR described it as an "own gait, but mainly it's
simply a speed factor" and said its governing skill is "not defined yet -
maybe a generic 'warfare' skill". Which skill governs duck-walk speed and block
success is the remaining open point in #267; BR's warfare skill is a lean, not a
ruling.

- **Right mouse sets the combat stance:** holding it raises a melee weapon into
en-garde, and releasing it lowers the weapon. When #267 lands, holding it will
also ready a firearm, bringing it up to fire from the hip; releasing it will
lower the firearm. When #267 lands, the held firearm pose will show readiness;
there will be no HUD indicator. BR described the pose direction on 2026-10-05:
"the UI must show unreadied vs readied / unreadied does not have muzzle forward
- rather downward". When #267 lands, an unreadied firearm's muzzle points down;
readying brings it up and forward.
- **Aiming down the sights is a toggle within the ready stance,** for firearms
  only: while right-click is held, a middle click or Shift switches between hip
  and sights (the view narrows through the sights). Input interpretation belongs
  to `src/game/input.ts`, `Input`, rather than a parallel interface map.
- **Melee also requires readiness:** BR said, "yeah, melee needs 'en-garde' on
  right-mouse-hold, which also enables blocking incoming melee (based on skill)".
  When #267 lands, an unready left-click does not swing.
- **Blocking requires en-garde and backing off:** holding right mouse and S
  blocks incoming melee; en-garde alone does not. BR answered #267's question
  1a on 2026-10-05: "1a. yes S is required to actually block from en-garde".
  Whether a block succeeds depends on the skill that remains open in #267.
- **Unready firearm left-click is an exception to refusal:** BR's answer for an
  unreadied firearm was "nothing". When #267 lands, it produces no shot and no
  nope sound; this deliberate no-op does not use the ordinary refusal cue.
- **Hand activation follows actor roles (BR, 2026-10-04):** dominance is
  identity, not a remapping of physical inventory slots. A held item cannot
  become an unarmed attack, and a two-handed hold's support must not activate
  the other hand's item. See `src/game/input.ts`, `KEY_BINDINGS`, and
  `src/game/primaryAction.ts`, `selectPrimaryAction`, for bindings and admission.
  The native creation choice precedes gameplay construction; Continue restores
  identity rather than consulting creation preferences. See
  `docs/character-handedness.md` for the accepted-launch and physical-pose
  boundaries.
- Lowered, a held item may block part of the view (as held models do today).
  When #267 lands, readying a firearm brings its held pose forward.

## Development and playtest

- **`?debug=1` is the development profile.** Its panel, readouts and tools live in
  `src/debug` and load only there (ui.2's split). They can say anything.
- **Playtests need hints but not debug tools.** A playtest profile (a URL flag, not
  a build) shows the hint channel and nothing from `src/debug`, so a tester sees
  the game close to how it ships, with the instructions it still needs.
- **The shipped profile** shows no hints and no debug, and its HUD defaults are
  empty (as ui.1 already made them).

## Where the current interface stands

| Element | Kind now | Target | Gap |
|---|---|---|---|
| HUD stats (health, food, fatigue…) | meta, opt-in | bodily | the cues in "Bodily cues"; the opt-in stays for development |
| Clock readout | meta, opt-in | diegetic | a watch, when you look at your wrist or hold one |
| Crosshair | meta, opt-in | none | shipped: none, ever; aiming down the sights uses the weapon's sights, and hip fire is imprecise by design. The opt-in dot stays for development |
| Interaction hints ("looking at…", "F: open") | meta, opt-in | spatial | a faint outline on the one usable thing you look at within reach; no text, no key name |
| Quickbar | meta, opt-in | meta | fine as a frame of slots; no instructional text (the fix just requested) |
| Damage vignette and tilt | bodily | bodily | shipped as it is |
| Rest and sleep screen | meta | bodily plus meta | the spinning clock and edge darkening can stay; the stop hint is built by `src/ui/rest.ts`, `stopHint` |
| Interruption prompt ("C: continue X: stop") | meta, instruction | meta, choice | a two-button choice drawn as such, with the key names from the hint channel |
| Main menu (F9) | meta | meta | fine; settings and help live here |
| Inventory screen | meta | meta | grids stay; numbers per DESIGN.md "numbers are there when you look" |
| Notices ("Quickbar 1 is empty: open the inventory…") | mixed | voice | keep the voice part, move the procedure to the hint channel |
| Drawn menu cursor | meta | meta | fine |

## Numbers and diegesis

DESIGN.md's "UI principles" said every number the simulation uses can be seen
somewhere in the UI, which pulls the other way from "as diegetic as possible".
BR ruled on 2026-09-28 to keep both by where the number appears, not whether:
**numbers are available on request, on meta surfaces the player opens**
(inspecting an item, the inventory), and never pushed at the player during play.
DESIGN.md's line is amended to say so.

## Rulings (formerly open questions)

1. **Crosshair (BR, 2026-09-28): none in the shipped game.** Aiming down the
   sights uses the weapon's own sights; hip fire and melee have no reticle. The
   opt-in dot remains a development setting.
2. **Interaction affordance (BR, 2026-09-28): a subtle outline** on the one usable
   thing you look at within reach. No text and no key name; the outline is the
   affordance.
3. **Numbers (BR, 2026-09-28): on request only,** on meta surfaces, as above.
4. **Onboarding (BR, 2026-09-28): diegetic, designed after the playtest.** The
   shipped first run gets a diegetic introduction (a note, a radio), shaped by
   where playtesters get stuck; hints remain a fallback setting in the F9 menu,
   off by default.
5. **Playtest profile (BR, 2026-09-28): a URL flag, `?playtest=1`,** which turns
   the hint channel on and loads nothing from `src/debug`.
6. ~~Are the character's own sounds noise events?~~ **BR, 2026-09-27: "Let's
   try"**, with OpenGameArt packs to curate from (vocal pain and strain, creature,
   RPG, zombie and hit sounds) and "variation is nice - random, but curated picks
   for the events we have". The first audio item makes the player's vocal sounds
   (pain now, coughs and groans with the bodily cues) noise events with a radius
   in data, so the effect can be judged in game and tuned or turned off.

## Order of work

1. ~~BR rules on the open questions; this document goes to `status: active`.~~
   Done 2026-09-28.
2. The hint channel, the bindings-sourced key labels and the guard test (one
   item, the way ADR 0001's guard landed), moving today's instructional strings
   into the table.
3. The playtest profile.
4. The player-sound system (Web Audio, sounds as content, CC0 sources).
5. The bodily cues, one state at a time (seen and heard together), each judged
   by BR in game before the HUD line it replaces is retired.
