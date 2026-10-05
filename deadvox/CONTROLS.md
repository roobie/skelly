---
id: skelly::deadvox-controls
description: Player input policy, BR's rulings, native browser boundaries and unresolved combat controls.
tags: [deadvox, design, controls, input, ui]
created: 2026-09-28
status: active
read_if:
  - you plan or change player or debug input bindings
  - you review BR's control rulings or unresolved input questions
  - you change input ownership, binding preferences or their labels
---

# Controls and input ownership

Read with [INTERFACE.md](INTERFACE.md), especially “Afford, don't instruct” and
“Readying before acting”. Combat proposals below are not implemented merely by
appearing in this document.

## BR's rulings

- **One registry, player rebinding (2026-10-04):** “we must make it so the player
  can rebind any keyboard input - this means we need a 100% centralised registry”.
  See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, rather than a copied default
  list. The controls card and settings are generated from that same catalogue;
  see `src/game/controls.ts`, `controlsCardRows`, and `src/ui/inputOptions.ts`,
  `mountInputOptions`.
- **Physical position, not layout glyph:** `KeyboardEvent.code` identifies the
  input; layout affects only its displayed label. This avoids moving movement
  positions on another keyboard layout. See `BindingRegistry.loadLayout` and
  `labelForAction` in `src/game/inputBindings.ts`.
- **No Ctrl or Cmd, ever (2026-10-04):** “due to the browser being the browser,
  we cannot use Ctrl or Cmd for anything, ever.” Game bindings refuse these
  modifiers; native text editing and browser shortcuts remain native.
- **Quick actions (2026-10-04):** “hold T+click on item does the quick action
  (auto move)”. The held quick-action gate is rebindable. It saves clicks, not
  handling time, and never invokes an item's use action. See
  `src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, and
  `src/core/options.ts`, `quickMove`.
- **Debug gate (2026-10-04):** “gating them all behind e.g. holding down F1 then
  pressing the debug key? Unless some special circumstance for a key need it
  readily available”. The gate is itself a binding, not a native OS modifier.
  A consumed debug chord cannot also execute its ordinary gameplay command.
- **Interaction and reserved lean inputs (2026-09-27):** F interacts; Q and E
  remain reserved. Reserve their physical positions across contexts, including
  debug, rather than inventing no-op lean commands.
- **Main menu and browser menu (2026-09-28):** F9 is the main menu; F10 belongs
  to the browser. Escape releases pointer lock and is never a game rebind.
- **Reload only (2026-10-04):** “It shall mean only (re)load in the default
  view”; “press and hold R to load it with shells from inventory double-press
  R to rack”; “Single tap r does nothing”. The two gestures share one atomic
  binding slot. Classification belongs to `src/game/reloadInput.ts`,
  `ReloadInput`; ammunition work belongs to its existing handling owner.
  Inventory rotation is a different visible context, not another reload gesture.
- **No rest or sleep keys (2026-10-04):** rest uses restable furniture and
  sleep uses sleepable furniture. Neither has a registry entry. Furniture
  initiation belongs to d45 through ordinary world interaction; stopping and
  continuing owned work retain their semantic controls.
- **Wield, then activate (2026-10-04):** “diegesis: wield item->activate”. A key
  acts on the door from a hand; an ammunition box is wielded and activated to
  unpack. No inventory shortcut replaces those mechanics.
- **Dominant and off roles (2026-10-04):** handedness is actor identity, not a
  chord swap or physical slot migration. See `src/core/character.ts`,
  `dominantSide` and `offSide`; `src/game/primaryAction.ts`,
  `selectPrimaryAction`; and [character-handedness.md](docs/character-handedness.md).
  Pointer action identities are in `src/game/inputBindings.ts`, `POINTER_ACTIONS`;
  keyboard rebinding does not add mouse-rebinding UI.
- **Quickbar (2026-10-05):** a tap takes an item into its capability-directed
  hand or puts it away; a hold uses an available action. See
  `src/game/quickbarInput.ts`, `QuickbarInput`, and
  `src/game/quickbarActions.ts`, `QuickbarActions`.

## Why there is one keyboard owner

A context describes visible attention, not hidden mechanic eligibility. Menus,
reading, inventory and debug modals shield gameplay even if no widget consumes a
particular key. Availability, reach, ammunition and action refusal remain with
existing gameplay owners. See `src/game/inputBindings.ts`, `KeyboardInput`, and
`src/game/play.ts`, `startPlay`.

One key can own several press kinds only as a declared gesture family, not as
competing listeners. Rebinding the reload slot changes both commands together;
there is no second gesture scheduler. Conflict refusal names the overlapping
semantic action/context and checks all alternatives, gates and held modifiers.
A held modifier must not silently steal sprint. See `bindingConflict` in
`src/game/inputBindings.ts`.

Owner changes, lost focus, pointer-lock loss and changed bindings withdraw held
intents and the owned reload/quickbar gestures. Already-held gameplay keys must
be released before they can act in a new owner. Unrelated handling jobs are not
cancelled by input cleanup. Debug unfreeze uses DOM input, not simulation ticks.
The source guard in `test/inputLiterals.test.ts` prevents other modules from
acquiring physical key literals or DOM keyboard interpretation.

## Native browser boundary and exceptions

Native text entry, IME, selection, clipboard, focus traversal and ordinary menu
form activation stay with the DOM. Reimplementing a text editor or focus engine
would add a second platform without a game-specific inadequacy. Interpreted game
commands, custom modal navigation and held quick/debug gates remain rebindable.
See `src/game/inputBindings.ts`, `NATIVE_INPUTS` and `NATIVE_EDITING`.

Noclip flight is the substantive debug exception: holding the debug gate for an
entire flight would occupy a hand and interfere with viewing. Flight controls
only act in the visible noclip context; entering/exiting it remains gated.
Spawn selection and dismissal are ordinary modal navigation, not authoring.
Actual keyboard spawning and native activation of debug buttons still require
the gate. Mouse authoring remains available without it.

Alt is not refused pending BR's ruling. `REFUSED_MODIFIERS` in
`src/game/inputBindings.ts` is the one place to extend refusal; it also drives
capture diagnostics. A deliverable key does not prove immunity from desktop OS
interception. Chromium/Firefox native input and pointer-lock checks do not imply
Safari or macOS acceptance.

## Preferences, not save identity

`BindingRegistry` in `src/game/inputBindings.ts` uses the same origin-local
JSON/localStorage substrate as HUD/audio preferences. “Per player” means this
browser profile, not a saved character or an account. HTTP/HTTPS origins do not
share preferences. There is no migration, preference workflow or cross-tab
coordination layer.

Stored rows are untrusted: unknown/invalid overrides are dropped, conflicts are
resolved deterministically, and defaults remain usable. A storage refusal leaves
the session's accepted rebind usable and reports a nonfatal preference notice.
Reset clears overrides and transient input. No save-format field changes.

## Combat proposals and open questions

BR ruled on 2026-09-27 that holding the right mouse button readies a weapon;
firearms shoot only while ready. A middle click or Shift would toggle hip/sights
within readiness, ready caps speed at a hurried march, and backing off while
ready blocks melee. These proposals must not be inferred from the registry or
silently added while porting inputs.

1. Dominant/off activation bindings remain open to revision after play; anatomy
   is not a binding policy.
2. Press-and-hold for all long uses remains a direction from 2026-09-28, not a
   universal cancellation rule. Do not redesign mouse use as part of rebinding.
3. Continue on the interruption card versus future crouch is a visible-state
   overload to settle before crouch lands. A clickable choice could remove it.
4. Best-pocket's default remains BR's decision; its entry is authoritative in
   the registry, not duplicated here.
5. Future ready/sights, crouch, throw, lean, craft and magazine-check inputs are
   added only when their mechanic lands, against the whole conflict model.
