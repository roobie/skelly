---
read_if:
  - you're deciding what the interface may tell the player and in what voice
  - you're changing prompts, HUD language, feedback or bodily cues
  - you're changing HUD options, UI layering or choice controls
  - you're changing debug/playtest separation or inventory layout
---

# Deadvox interface

[INTERACTIONS.md](INTERACTIONS.md) owns the UI/core boundary. This document keeps the interface rules: what the character may know, how the game presents it, and what remains development-only. The design rationale is in [DESIGN.md](DESIGN.md).

## Diegesis and development

Prefer information carried by the world, the character's body and held items. The interface adds only what those cannot convey. Development readouts, instructions and test controls may break diegesis when clearly separated from the shipped profile and removable as a whole.

Every element is diegetic, bodily, spatial or meta. Prefer bodily cues over persistent statistics when a state can be communicated through sight or sound; use spatial outlines only when the world cannot make an interaction clear. Meta HUD elements start enabled and can be turned off individually.

A new element names its kind at the view-model boundary and explains why a less intrusive kind would not suffice. See `src/ui/hudOptions.ts`, `DEFAULT_HUD_OPTIONS`.

## Bodily cues

Cues scale with severity, fade quickly, avoid spam and use the character's own sounds. Pain and strain sounds are world noise events with tunable radii in content; BR judges their attention cost in play and decides whether to tune or disable them. A player-only refusal cue does not become simulation noise. The red damage vignette and tilt are the reference; BR judges replacement bodily cues in play before a HUD line retires. Needs and bodily states should become legible without requiring a number on screen. BR also chooses which sounds accompany each bodily state; the content examples are proposals, not approved recordings or a fixed cue list.

Pain tiers drive diegetic bodily cues. Pain itself has no upper bound, so its number does not appear in a player-facing cue. Painkillers mask felt pain without healing the injury.

## Text

The interface affords actions rather than writing procedures. Shipped text may be world-authored information, names/facts the character knows, or short first-person refusal/observation. Text naming keys, clicks, menus or procedures is development instruction and must stay out of the shipped profile.

Key labels come from bindings so rebinding cannot leave stale instructions. A future hint channel should own the remaining instructional text and expose it only in development/playtest profiles. A first-run tutorial should be diegetic before relying on hints. Review asks whether the player could learn the information from the world or their hands. Numbers stay available on surfaces the player opens, but are not pushed during play; this keeps simulation facts accessible without undermining diegesis.

## Class 3: the character's voice

Short first-person refusals and observations name the world or the character's state, not keys or procedures. Their reason text follows the messages HUD option; the refusal sound remains a player-only presentation cue. See `src/game/tierNotice.ts`, `TierNotice`.

## HUD

The HUD options and master toggle govern HUD-owned elements. World, bodily and held-item cues remain outside them. See `src/ui/hudOptions.ts`, `hudVisibility`.

The interactible outline is an optional spatial HUD aid, separate from interaction hints. It compensates for objects whose appearance does not make their usable parts clear; it is not a substitute for diegetic affordances. Prefer making objects look interactible so players can discover actions without this crutch. See `src/render/interactionMarker.ts`, `markInteractionTarget`.

The optional stats readout is a tuning surface for viewing felt pain and its components during play. It is a development-style meta readout, not a bodily cue; this exception keeps the scale available for tuning without putting an unbounded number in player-facing cues.

## Combat and feedback

Combat readiness is a stance, not a HUD mode. Firearms fire only while ready; an unready click does nothing and produces no refusal sound. Melee attacks require en-garde, and blocking also requires backing off. Firearms Combat affects duck-walking; Melee Combat affects blocking. Hand activation follows actor roles without remapping physical slots. See `src/game/inputBindings.ts`, `BindingRegistry`, and `src/game/primaryAction.ts`, `selectPrimaryAction`.

Bleeding feedback names each region's tier when messages are enabled. A content tier marked for warning gets a warning; a quiet tier stays quiet. Refusal text follows the messages option, while the character's refusal sound remains available. Treatment progress belongs to the handling HUD; recipe reading progress belongs on the open page because it provides an endpoint even when HUD options are off.

## Development, playtest and errors

`?debug=1` is a development profile whose tools and readouts may be instructional. A separate playtest profile remains planned: it should show needed hints without god mode, spawning, noclip or time controls. Testers hand back metrics and replays through the menu, not the debug panel. The shipped profile has no debug tools and leaves HUD options enabled by default.

A blocking runtime error halts play, releases pointer lock and prevents further saves. It offers the full error for copying and a local report download; nothing is sent automatically. Reports can contain world, browser and recent playtest data, so review them before public sharing. See `src/ui/errorReport.ts`, `errorReportText`, and `src/game/play.ts`, `stopPlayAfterError`.

The HUD toggle hides every element owned by HUD options without changing individual settings. World, bodily cues and the compass display remain; inventory help and the rest card's stop hint remain because they are not governed by those options. See `src/ui/hudOptions.ts`, `HudSettings`, and `hudVisibility`.

## Layout

The drawn cursor stays above ordinary panels while pointer lock is held; otherwise the player cannot see where menu actions land. The debug review map may cover it because opening that map releases gameplay input. In-game choices use the game's combo box rather than a native select, which would take focus and pause play. See `src/ui/style.css`, ":root", and `src/ui/comboBox.ts`, `comboBox`.

Keep the nearby inventory pane wide enough for a content-capped container; selected details yield before useful grids are squeezed. See [inventory-layout](docs/inventory-layout.md).

## Title choice

A compatible saved world makes Continue and replacement the primary, centred title
choice. Replacement names its destructive effect and still requires confirmation;
an empty canvas click must not choose it. Storage and build diagnostics stay secondary
so they cannot bury the decision. Without a compatible save, the simple start remains.
See `src/ui/saveController.ts`, `SaveController`, and `src/ui/style.css`, "#overlay.startup-ready.saved-choice".

## Open direction

- Build the hint channel and its guard before expanding shipped instructions.
- Add the playtest profile, then shape a diegetic first-run introduction from playtest findings.
- Make the clock diegetic through a watch.
- Develop bodily cues one state at a time; retire a HUD line only after its replacement is judged in play.
