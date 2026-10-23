---
read_if:
  - you're writing or changing any player-visible text
  - you're deciding what the interface may tell the player and in what voice
  - you're changing prompts, HUD language, feedback or bodily cues
  - you're changing HUD options, UI layering or choice controls
  - you're changing debug/playtest separation or inventory layout
  - you're implementing or refining inventory item pictures, lighting or state depiction
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

A screen is not a narrator. Before writing or changing text a player sees in the shipped or playtest profile, keep only labels, values, characters speaking, events and button text. Everything else is narration: cut it when the player can already see it or will learn it by playing. A needed rule the player cannot observe, such as a threshold, multiplier or hidden cause, belongs in a hover or keyboard-focus detail on the thing it explains. During pointer-locked play, put that detail on a surface the player opens rather than an unhoverable HUD element.

Hover and focus details use one or two sentences of plain fact. No wordplay, contrasts such as “fewer X, more Y”, reassurance or “you should”. World-authored notes, books and signs are characters speaking; short first-person refusals and observations name the world or the character's state, not procedures.

The interface affords actions rather than writing procedures. Control labels come from bindings so rebinding cannot leave stale labels. Numbers stay available on surfaces the player opens rather than being pushed during play, keeping simulation facts accessible without undermining diegesis. Gungen and mobgen viewers are development tools, outside this rule.

## Class 3: the character's voice

Short first-person refusals and observations name the world or the character's state, not keys or procedures. Their reason text follows the messages HUD option; the refusal sound remains a player-only presentation cue. See `src/game/tierNotice.ts`, `TierNotice`.

## HUD

The HUD options and master toggle govern HUD-owned elements without changing individual settings. World, bodily and held-item cues, the compass display, inventory controls and the rest card remain outside them. Interaction hints are hidden while a modal screen is open, because the screen owns input and a world hint over it is noise. See `src/ui/hudOptions.ts`, `HudSettings`, and `hudVisibility`.

A bound key in a hint or label is drawn as a key cap, a small bordered capital, so the player reads it as a key to press rather than as a word. One shared render takes the live binding label, so a rebind redraws every cap and the look stays in the stylesheet. See `src/ui/keyCap.ts`, `keyCap`, and `src/ui/style.css`, ".keycap".

The interactible outline is an optional spatial HUD aid, separate from interaction hints. It compensates for objects whose appearance does not make their usable parts clear; it is not a substitute for diegetic affordances. Prefer making objects look interactible so players can discover actions without this crutch. The outline must not become a glowing substitute for seeing the object: it receives the scene's surface lighting, without emission or a minimum visibility floor. Its edge normals bisect the adjacent faces, so an edge cannot receive direct light when neither adjoining face faces the light. This keeps its yellow cue responsive to lamps and flashlights as well as the sky, rather than treating a sky-intensity estimate as surface brightness. See `src/render/interactionMarker.ts`, `markInteractionTarget`, and `src/render/furniture.ts`, `markerEdges`.

The held-item action list is meta presentation: the held geometry cannot express which of several valid operations a click will perform. It shares the interaction-hint visibility policy but stays in the lower left so a choice does not cover the target. See `src/game/survival.ts`, `Survival.wieldedItemActionHint`, and `src/game/play.ts`, `promptText`.

The optional stats readout is a tuning surface for viewing felt pain and its components during play. It is a development-style meta readout, not a bodily cue; this exception keeps the scale available for tuning without putting an unbounded number in player-facing cues.

## Combat and feedback

Combat readiness is a stance, not a HUD mode. Firearms fire only while ready and not sprinting; an unready click does nothing and produces no refusal sound. Melee attacks require en-garde, and en-garde alone blocks, so guarding needs no extra key. Firearms Combat affects duck-walking; Melee Combat affects blocking. Hand activation follows actor roles without remapping physical slots. See `src/game/play.ts`, `fireHeldItem` and `shouldPlayerBlock`; `src/game/inputBindings.ts`, `BindingRegistry`; and `src/game/primaryAction.ts`, `selectPrimaryAction`, for which held item owns the click.

Bleeding feedback names each region's tier when messages are enabled. A content tier marked for warning gets a warning; a quiet tier stays quiet. Refusal text follows the messages option, while the character's refusal sound remains available. Treatment progress belongs to the handling HUD; recipe reading progress belongs on the open page because it provides an endpoint even when HUD options are off.

## Development, playtest and errors

`?debug=1` is a development profile whose tools and readouts may be instructional. Testers hand back metrics and replays through the menu, not the debug panel. The shipped profile has no debug tools and leaves HUD options enabled by default.

A blocking runtime error halts play, releases pointer lock and prevents further saves. It offers the full error for copying and a local report download; nothing is sent automatically. Reports can contain world, browser and recent playtest data, so review them before public sharing. See `src/ui/errorReport.ts`, `errorReportText`, and `src/game/play.ts`, `stopPlayAfterError`.

## Layout

The drawn cursor stays above ordinary panels while pointer lock is held; otherwise the player cannot see where menu actions land. The debug review map may cover it because opening that map releases gameplay input. In-game choices use the game's combo box rather than a native select, which would take focus and pause play. See `src/ui/style.css`, ":root", and `src/ui/comboBox.ts`, `comboBox`.

Keep the nearby inventory pane wide enough for a content-capped container; selected details yield before useful grids are squeezed. See [inventory-layout](docs/inventory-layout.md).

## Item pictures

The goal is for anyone to identify an item at a glance. Start with pictures in
inventory tiles alongside names and counts, with a larger picture for the selected
item, and refine the approach incrementally toward that goal. Pictures connect
shape and fitted equipment to the object seen in hand or on the ground; names
still distinguish items that share a model, and text carries exact facts and
condition that geometry cannot show. Useful grids and their pointer access take
precedence over a larger illustration. See `src/ui/inventoryScreen.ts`,
`itemTemplate` and `detailsTemplate`, and `docs/inventory-layout.md`,
"Clickable inventory layout".

Use runtime-cached stills derived from the item's own model and fitted parts.
Sharing the likeness avoids a second art obligation for new items and mods, while
runtime composition avoids baking every fitted combination. Stills avoid
continuous rendering competition with the moving world, at the cost of cold
picture generation and cache upkeep. Readiness and appearance changes must not
leave stale pictures. See `src/render/itemLook.ts`, `itemLook`, and
`src/render/models.ts`, `ModelLibrary`.

Use neutral reference lighting so recognition remains stable in darkness and
pictures can be reused without following world-light changes. The picture is an
abstract reference, not a claim that the object is illuminated in the world. It
does not grant knowledge of hidden contents; the knowledge boundary in
`DESIGN.md`, "UI principles", still holds.

An item deliberately authored without a model keeps its text tile without a
picture. Uneven visual coverage is preferable to blocking new items and mods on
art or pretending a generic bundle is the item's likeness. This is distinct from
a declared model failing to load: errors must not be hidden as intentional
coverage, and temporary loading must not become a permanent absent picture.
See `src/core/schema.ts`, `ItemSchema`, and `src/render/models.ts`, `ModelLibrary`.

Pictures depict stable instance snapshots, not handling motion. This supports
recognition of fitted equipment without another animation or action owner.
State that geometry cannot express remains text; a misleading pose must be
corrected or omitted, not excused as static. A fitted magazine does not prove
loaded ammunition. Pictures remain subject to the shared instance-look rule in
`DESIGN.md`, "Piles and item models": they must not imply fitted parts or handling
state the owned item lacks. See `src/render/itemLook.ts`, `itemLook`.

## Title choice

A compatible saved world makes Continue and replacement the primary, centred title
choice. Replacement names its destructive effect and still requires confirmation;
an empty canvas click must not choose it. Storage and build diagnostics stay secondary
so they cannot bury the decision. Without a compatible save, the simple start remains.
See `src/ui/saveController.ts`, `SaveController`, and `src/ui/style.css`, "#overlay.startup-ready.saved-choice".
