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
  - you add a pointer, click or wheel action
---

# Controls and input ownership

Read with [INTERFACE.md](INTERFACE.md), especially “Afford, don't instruct” and
“Readying before acting”. Settled controls are recorded here as rationale; future
controls remain proposals until their issue is implemented.

## BR's rulings

- **One registry, player rebinding (2026-10-04):** “we must make it so the player
  can rebind any keyboard input - this means we need a 100% centralised registry”.
  See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, rather than a copied default
  list. The controls card and settings are generated from that same catalogue;
  see `src/game/controls.ts`, `controlsCardRows`, and `src/ui/inputOptions.ts`,
  `mountInputOptions`.
- **Rebindability and the debug exception (2026-10-04 12:12):** “we must make it so
  the player can rebind any keyboard input - this means we need a 100% centralised
  registry and as for the debug keybinds, how about gating them all behind e.g.
  holding down F1 then pressing the debug key? Unless some special circumstance for
  a key need it readily available”. The noclip flight keys are that special
  circumstance; see `noclip.ascend` and `noclip.descend` in
  `src/game/inputBindings.ts`.
- **No Ctrl, Cmd or Meta, ever (2026-10-04):** “due to the browser being the
  browser, we cannot use Ctrl or Cmd for anything, ever.” Game bindings refuse
  these modifiers; native text editing and browser shortcuts remain native.
- **Quick actions (2026-10-04):** “like with F1 being the debug mod key ... we'd
  use a non modifier key, like say 'T' as a general quick action mod key” and
  “hold T+click on item does the quick action (auto move)”. The held
  quick-action gate is rebindable. It saves clicks, not handling time, and
  never invokes an item's use action. See
  `src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, and
  `src/core/options.ts`, `quickMove`.
- **Debug gate (2026-10-05 19:52):** “debug modifier F2 to not collide with a builtin
  hotkey”. Every debug action uses a held F2 gate. The gate is itself a binding,
  not a native OS modifier. A consumed debug chord cannot also execute its
  ordinary gameplay command. See `src/game/inputBindings.ts`, `debug.gate`.
- **Interaction and reserved lean inputs (2026-09-27):** F interacts; Q and E
  remain reserved. Reserve their physical positions across contexts, including
  debug, rather than inventing no-op lean commands.
- **Main menu and browser menu (2026-09-28):** F9 is the main menu; F10 belongs
  to the browser. Escape releases pointer lock and is never a game rebind.
- **Reload only (2026-10-04):** “It shall mean only (re)load in the default
  view”; “press and hold R to load it with shells from inventory double-press
  R to rack”; “Single tap r does nothing”. The two gestures share one atomic
  slot so rebinding cannot split a coupled action. `ReloadInput` in
  `src/game/reloadInput.ts` owns classification; ammunition work belongs to its
  existing handling owner.
  Inventory rotation is a different visible context, not another reload gesture.
- **No rest or sleep keys (2026-10-04):** “`rest` shouldn't have a dedicatec
  keybind - instead, you interact with 'restable' items - e.g. beds, sofas,
  chairs, etc” and “`L` remvoed - sleep is on sleepable objects, like bed”.
  Neither has a registry entry. Eligible furniture starts these actions through
  the world-interaction binding; see `src/game/play.ts`, `startPlay`.
- **Wield, then activate (2026-10-04):** “that's not a thing you do in inventory
  - you wield the box and activante it in oder to unpack”. A key acts on the
  door from a hand; an ammunition box is wielded and activated to unpack. See
  `src/game/primaryAction.ts`, `selectPrimaryAction`.
- **No inventory U action (2026-10-05 13:16):** “U shouldn't be a thing - where
  does this false knowledge still stand?” Use items through their wielded or
  quickbar action instead; `INPUT_BINDINGS` in `src/game/inputBindings.ts` has no
  inventory-use row.
- **Dominant and off roles (2026-10-04):** handedness is actor identity, not a
  chord swap or physical slot migration. See `src/core/character.ts`,
  `dominantSide` and `offSide`; `src/game/primaryAction.ts`,
  `selectPrimaryAction`; and [character-handedness.md](docs/character-handedness.md).
  Pointer action identities are in `src/game/inputBindings.ts`, `POINTER_ACTIONS`;
  keyboard rebinding does not add mouse-rebinding UI. For d94, wielded-item wheel
  selection belongs to a pointer-specific owner, not `BindingRegistry`: a directional
  wheel event is not a keyboard chord. See `src/game/input.ts`, `Input`, and
  `src/game/play.ts`, `startPlay`; `src/ui/menuPointer.ts`, `mountMenuPointer`, keeps
  menu scrolling in its separate route.
- **Quickbar (2026-10-05 14:43):** “okay, yes, quickbar-hold is the secondary allowed
  pathway to activating / but e.g. racking a shell into a shotgun is _not_
  covered by the quickbar-hold”. A tap takes an item into its capability-directed
  hand or puts it away; a hold uses an available action. See
  `src/game/quickbarInput.ts`, `QuickbarInput`, and
  `src/game/quickbarActions.ts`, `QuickbarActions`.
- **Lighting (2026-10-05 14:43):** “lighting need the matches in your hand.”
  See `src/game/primaryAction.ts`, `selectPrimaryAction`.
- **Matches (2026-10-05 13:44):** “Whether matches strike alone remains open for
  BR.”
- **Interaction hints (2026-10-06 08:35):** BR said “we should make
  press-and-hold-for-1-second tilde key to toggle messages/hints”. A hold on the
  rebindable tilde-position key toggles the existing HUD option; a tap does
  nothing. Debug panel access remains gated. `PressHoldInput` in
  `src/game/pressHoldInput.ts` owns the elapsed-time gesture;
  `HUD_HINTS_HOLD_MS` in `src/game/inputBindings.ts` owns its threshold.
- **Noclip flight (2026-10-06 11:22):** “we should use Space for UP and C for
  DOWN” and “and no, F2 is not required for these (in debug mode when noclip is
  active)”. These are the special-circumstance exception to the debug gate;
  they work only while noclip is active, and WASD remains usable during flight.
  See `src/game/inputBindings.ts`, `noclip.ascend` and `noclip.descend`.
- **Continue (2026-10-06 11:28):** BR's choice was “1. enter”. Enter continues
  both after an interruption and a stopped craft. BR also said “let's make
  crouch a toggle”; #304 may bind C to crouch outside noclip. See
  `src/game/inputBindings.ts`,
  `compression.continue` and `craft.continue`.

## Why there is one keyboard owner

A context describes visible attention, not hidden mechanic eligibility. Menus,
reading, inventory and debug modals shield gameplay even if no widget consumes a
particular key. Availability, reach, ammunition and action refusal remain with
existing gameplay owners. See `src/game/inputBindings.ts`, `KeyboardInput`, and
`src/game/play.ts`, `startPlay`.

Physical positions match regardless of layout; only labels use the browser's
layout map. See `BindingRegistry.loadLayout` and `labelForAction` in
`src/game/inputBindings.ts`.

Rebinding checks every alternative, gate and held modifier because a hidden
conflict could steal sprint or run two actions. `bindingConflict` in
`src/game/inputBindings.ts` owns that check; `test/inputLiterals.test.ts` keeps
keyboard interpretation at the registry boundary.

## Native browser boundary and exceptions

Native text entry, IME, selection, clipboard, focus traversal and ordinary menu
form activation stay with the DOM. Reimplementing a text editor or focus engine
would add a second platform without a game-specific inadequacy. Interpreted game
commands, custom modal navigation and held quick/debug gates remain rebindable.
See `src/game/inputBindings.ts`, `NATIVE_INPUTS` and `NATIVE_EDITING`.

Noclip flight is the substantive debug exception: holding the debug gate for an
entire flight would occupy a hand and interfere with viewing. Space/C flight
controls are ungated only in the visible noclip context; entering/exiting it
remains gated. BR's earlier exception clause was “Unless some special circumstance
for a key need it readily available”. Spawn selection and dismissal are ordinary
modal navigation, not authoring. Actual keyboard spawning and native activation
of debug buttons still require the gate. Mouse authoring remains available
without it.

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

Stored preferences are untrusted, so invalid rows are dropped instead of
becoming controls; see `BindingRegistry` in `src/game/inputBindings.ts`.

## Readiness and melee (2026-10-05, #267)

Firearms fire only while ready and never while sprinting. Ready movement is a
skill-scaled duck-walk, not crouch. En-garde melee uses right-mouse hold; blocking
also requires S and succeeds according to melee skill. An unready firearm click
does nothing, including no refusal sound. BR settled the skill split: “The FC
affects stuff like duck walking, whereas MC affects blocking”. See
[SLICE-3.md](SLICE-3.md), 3.1, `src/game/firearmHandling.ts`, `fireReason`, and
`src/game/melee.ts`, `shouldEnterMeleeReady`; the registry owns keyboard
bindings, not these mouse actions.

## Remaining questions

1. Press-and-hold for every long use remains a direction, not a universal
   cancellation rule. Do not redesign mouse use as part of rebinding.
2. Best-pocket's default remains BR's decision; its entry is authoritative in
   the registry, not duplicated here.
3. Future throw, lean and magazine-check inputs are added only when their
   mechanics land, against the whole conflict model.
