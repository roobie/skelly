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
  - you change how the drawn cursor drives menus under pointer lock
  - you implement or inspect input recording and replay
  - you change how a locked door advertises its crowbar fallback
  - you change stance hints or first-person held poses
---

# Controls and input ownership

Read with [INTERFACE.md](INTERFACE.md), especially “Afford, don't instruct” and
“Readying before acting”. Settled controls are recorded here as rationale; future
controls remain proposals until their issue is implemented. Character-screen tabs
and the Items tab's balanced, mouse-resizable split are described in [the inventory
layout](docs/inventory-layout.md); dragging the divider preserves a usable width for
both independently scrolling panes.

## BR's rulings

- **Keyboard controls:** The binding catalogue drives the controls card and
  settings, so rebinding updates the displayed key labels. The main-menu controls
  list uses case-insensitive substring search over action descriptions and key
  labels. Plain substring matching keeps results predictable: a partial action or
  key name returns every matching row without ranking. Native text ownership keeps
  search keystrokes from activating game actions. Ordinary runs hide debug-marked
  bindings and bindings scoped only to debug contexts because those controls are
  unavailable there; debug runs list them all. Debug actions use the held gate,
  with noclip flight controls as the readily available exception. See `src/game/inputBindings.ts`,
  `INPUT_BINDINGS`, `DEBUG_ONLY_CONTEXTS`, `KeyboardInput.install`,
  `noclip.ascend` and `noclip.descend`, and `src/game/controls.ts`,
  `controlsCardRows` and `filterControlsCardRows`; settings use
  `src/ui/inputOptions.ts`, `mountInputOptions`.
- **No Ctrl, Cmd/Meta or Alt as game modifiers:** The browser owns them (Ctrl/Cmd
  shortcuts; Alt+Left/Right go back and forward; on Windows and Linux, Alt or
  Alt+letter opens the menu bar). The registry refuses these modifiers; see
  `src/game/inputBindings.ts`, `REFUSED_MODIFIERS` and `KeyboardInput.press`.
  Outside that registry, Ctrl+click is a plain click, Ctrl+scroll is plain scroll,
  and quick move stays T+click (below). Native text editing and browser shortcuts
  stay native. A deliverable key does not prove immunity from desktop OS
  interception. Chromium and Firefox checks do not cover Safari or macOS.
  - **Where the wheel goes:** with the pointer locked in play it steps the
    wielded item's action. In a menu it scrolls the pane under the cursor, even
    at the pane's edge and with Ctrl held (`src/ui/menuPointer.ts`,
    `mountMenuPointer`). Elsewhere the game leaves the wheel alone, so where the
    pointer is free and no pane is under it, Ctrl+wheel is the browser's page
    zoom.
- **Quick actions (2026-10-04):** “like with F1 being the debug mod key ... we'd
  use a non modifier key, like say 'T' as a general quick action mod key” and
  “hold T+click on item does the quick action (auto move)”. The held
  quick-action gate is rebindable. It saves clicks, not handling time, and
  never invokes an item's use action. See
  `src/ui/inventoryScreen.ts`, `InventoryScreen.pointerDown`, and
  `src/core/options.ts`, `quickMove`.
- **Debug gate and review map (2026-10-05 19:52):** “debug modifier F2 to not
  collide with a builtin hotkey”. Debug authoring actions use a held F2 gate. In a
  debug game, F2+M opens the review map and Escape or F2+M closes it; F2+Numpad5
  freezes the game. The gate is itself a binding, not a native OS modifier. A
  consumed debug chord cannot also execute its ordinary gameplay command; enabling
  the gate preserves a held pointer stance and its ADS toggle. Spawn confirmation
  is a modal navigation exception: the menu itself remains debug-only, while Enter
  acts normally once it is open. BR's ruling is quoted in
  [TROUBLESHOOTING.md](TROUBLESHOOTING.md), “Debug parameters”. See
  `src/game/inputBindings.ts`, `KeyboardInput.cancel`, and `src/game/play.ts`,
  `toggleReviewMap`.
- **Interaction and reserved lean inputs (2026-09-27):** F interacts; Q and E
  remain reserved. Reserve their physical positions across contexts, including
  debug, rather than inventing no-op lean commands.
- **Loose-item pickup:** Players grab ground items from the normal game view by
  tapping F to wear a back-wearable when the back slot is free, otherwise pocket
  it; holding F wields it. The pickup uses the inventory's ordinary handling
  path, so wearing and pocketing retain their normal handling time. The reach
  animation is the same for either destination. Doors and containers
  keep their tap interaction. F uses one shared reach and target choice: exact
  ties favor furniture, while tied ground items resolve by item UID. Scatter
  items are targetable where they are drawn; `src/core/scatterPile.ts`,
  `pileScatterPlacements`, is shared by picking and rendering. `src/game/play.ts`,
  `interactionTargetAt` and `completeWorldInteraction`, route the gesture through
  the existing inventory handling owner; `src/render/grabPose.ts`, `grabPose`,
  supplies the visual-only reach.
- **Downed bodies:** F on a downed shambler follows the same tap and hold: a tap
  finishes it off, and a hold dismembers it. Two ways to clear a body need no
  second binding. A ray against the body's box picks it, in the same nearest-target
  choice as ground items. See `src/core/interactionPick.ts`, `pickInteractionTarget`,
  and `src/game/play.ts`, `interactionPayload`.
- **Main menu and browser menu (2026-09-28):** F9 is the main menu; F10 belongs
  to the browser. Escape releases pointer lock and is never a game rebind.
- **Reload, rack, remove (2026-10-07 11:20):** BR, on how R treats a rifle:
  “No, it should reload with the mag that is fullest in inventory, no matter what
  is loaded in gun”; on double-pressing R working the charging handle, “yes,
  correct”; and on removing the magazine, “Tap-then-press-and-hold R means remove
  mag”. Holding R swaps in the fullest carried magazine that fits, even one with
  fewer rounds than the fitted one. A double press racks. A tap followed by a
  press held past the hold threshold removes the fitted magazine to a pocket or
  the ground. Only the second press's length tells rack from remove, so neither
  acts until it is released or held: a quick tap-tap never removes, and a plain
  hold never removes. The gestures share one atomic slot so rebinding cannot
  split a coupled action. `ReloadInput` in `src/game/reloadInput.ts` owns
  classification and `RELOAD_GESTURE_MS` its timing; ammunition work belongs to
  its existing handling owner (`src/game/firearmHandling.ts`,
  `FirearmMechanics.loadNext` and `FirearmMechanics.removeMagazine`). Inventory
  rotation is a different visible context, not another reload gesture.
  - **Hold racks a gun without a magazine (2026-10-07 13:21, d114-11):** BR, on
    what tap-then-hold does on the pump: “d114-11: i think it makes sense for it
    to rack, but keep racking as long as the R button is held - it then reflects
    what removing the mag means for a firearm with it -> remove the magazine
    capacity”. On a gun without a detachable magazine, a tap followed by a held
    press racks, then racks again each time a rack finishes, until R comes up or
    nothing is left in the chamber or the tube. Each rack ejects what is
    chambered and feeds the next shell, so holding through unloads the gun; live
    shells land in the pile of the block they fall on, as spent cases do.
    Releasing R starts no further rack, and the one under way finishes. A gun
    with a detachable magazine keeps tap-then-hold as removal. See
    `ReloadBinding.stillLoaded` and `FirearmMechanics.stillLoaded`.
  - **A single tap does nothing (2026-10-04):** “Single tap r does nothing”.
- **No rest or sleep keys (2026-10-04):** “`rest` shouldn't have a dedicatec
  keybind - instead, you interact with 'restable' items - e.g. beds, sofas,
  chairs, etc” and “`L` remvoed - sleep is on sleepable objects, like bed”.
  Neither has a registry entry. Eligible furniture starts these actions through
  the world-interaction binding; see `src/game/play.ts`, `startPlay`.
- **Wield, then activate (2026-10-04):** “that's not a thing you do in inventory
  - you wield the box and activante it in oder to unpack”. A key acts on the
  door from a hand; an ammunition box is wielded and activated to unpack. See
  `src/game/primaryAction.ts`, `selectPrimaryAction`.
- **One world-interaction route for prying:** `world.interact` remains the only
  door action; on a locked door that supports prying it advertises the carried
  tool behind the interaction-hints toggle. This avoids adding a modifier or a
  second binding; the matching key stays on its existing activate action. See
  `src/game/inputBindings.ts`, `world.interact`, and `src/game/play.ts`, `startPlay`.
- **No inventory U action (2026-10-05 13:16):** “U shouldn't be a thing - where
  does this false knowledge still stand?” Use items through their wielded or
  quickbar action instead; `INPUT_BINDINGS` in `src/game/inputBindings.ts` has no
  inventory-use row.
- **Dominant and off roles (2026-10-04):** handedness is actor identity, not a
  chord swap or physical slot migration. See `src/core/character.ts`,
  `dominantSide` and `offSide`; `src/game/primaryAction.ts`,
  `selectPrimaryAction`; and [character-handedness.md](docs/character-handedness.md).
  Mouse-button codes share the binding registry: the held `stance.ready` and
  pressed `aim.ads-toggle` actions can each use a pointer button or a key. The
  wheel stays outside `BindingRegistry`, because a directional wheel event is not
  a keyboard chord: `src/game/play.ts`, `cycleWieldedAction`, owns wielded-item
  action selection, and `src/ui/menuPointer.ts`, `mountMenuPointer`, keeps menu
  scrolling in its separate route.
- **Quickbar (2026-10-05 14:43):** “okay, yes, quickbar-hold is the secondary allowed
  pathway to activating / but e.g. racking a shell into a shotgun is _not_
  covered by the quickbar-hold”. A tap takes an item into its capability-directed
  hand or puts it away; a hold uses an available action. See
  `src/game/quickbarInput.ts`, `QuickbarInput`, and
  `src/game/quickbarActions.ts`, `QuickbarActions`.
- **Wound treatment (2026-10-06 08:33):** BR said “the \"treat with rag\" is not the way to go. You wield the rag and left-click apply it (or quickbar-hold)”. Wielded-item action selection is stepped by the wheel and shown in the interaction hint; see `src/game/play.ts`, `cycleWieldedAction`, `src/game/itemActions.ts`, `ItemActionSelection`, and `src/game/survival.ts`, `wieldedItemActionHint`.
- **Lighting (2026-10-05 14:43):** “lighting need the matches in your hand.”
  See `src/game/primaryAction.ts`, `selectPrimaryAction`.
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
- **Spectator camera (d106-15):** Debug viewing moves a separate camera with the noclip flight step; it never moves the player's body. While detached, the same movement context routes flight input to the camera, and toggling back restores the body view. This is a debug view, not player noclip. See `src/game/play.ts`, `stepSimulation`, and `src/render/playView.ts`, `updateCamera`.
- **Continue (d98; BR, 2026-10-06 11:28):** BR's choice was “1. enter”. Enter
  continues both after an interruption and a stopped craft. See
  `src/game/inputBindings.ts`, `compression.continue` and `craft.continue`.
- **Crouch (d98):** BR ruled “let's make crouch a toggle”. On 2026-10-06
  12:25, BR said “i lean 'no' because if you're in a menu, you're not 'moving'”;
  the 2026-10-05 20:09 ruling is “long actions disable all actions”. Crouch is therefore
  available only in moving contexts, not menus or noclip, and a long action
  leaves the stance unchanged. Context ownership keeps the same physical input
  distinct from noclip descent; see `src/game/inputBindings.ts`, `INPUT_BINDINGS`.

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
See `src/game/inputBindings.ts`, `NATIVE_INPUTS` and `NATIVE_EDITING`. In a
pointer-locked menu, `mountMenuPointer` in `src/ui/menuPointer.ts` maps locked
cursor movement to range values because forwarded synthetic pointer events do not
trigger the browser's native range-drag action. It also cancels the real press's
own mousedown focus handling: that press lands on the locked canvas, so Firefox
would blur the focused field, closing an open combo box before the forwarded click
reaches its option. Focus moves only when a forwarded click lands on an input.

Noclip flight is the substantive debug exception: holding the debug gate for an
entire flight would occupy a hand and interfere with viewing. Space/C flight
controls are ungated only in the visible noclip context; entering/exiting it
remains gated. Spawn selection and dismissal are ordinary modal navigation, not
authoring. Keyboard confirmation is available only while that debug-only menu owns
input; native activation of debug buttons still requires the gate. Mouse authoring
remains available without it. The debug menu's type-spawn actions add no player
bindings; see `src/debug/index.ts`, `createDebugActions`.

## Preferences, not save identity

`BindingRegistry` in `src/game/inputBindings.ts` uses the same origin-local
JSON/localStorage substrate as HUD/audio preferences. “Per player” means this
browser profile, not a saved character or an account. HTTP/HTTPS origins do not
share preferences. There is no migration, preference workflow or cross-tab
coordination layer.

Stored preferences are untrusted, so invalid rows are dropped instead of
becoming controls; see `BindingRegistry` in `src/game/inputBindings.ts`.

## Input recording and replay (d101)

Replay samples controls at fixed player ticks so action order does not depend on browser
event timing. Hand-changing gestures apply at the sample that records them, in recorded
order. A throw and a following hand gesture therefore use the same pose and remaining items
in live play and replay. The replay rationale remains in
[SLICE-3.md](SLICE-3.md), 3.10. Replay fingerprints in `src/game/inputReplay.ts`,
`replayStateFingerprint`, compare simulation times exactly. Playback in
`src/game/inputReplayDriver.ts`, `InputReplayDriver`, advances to the next restored player
scheduler cursor and then to the recorded end time, so live and replay share the same tick
boundaries.

Replay covers inventory and crafting because those player flows should be reproducible,
not just movement. Its starting save and compatibility identity keep the recording separate
from world-save state; end-state fingerprints reveal uncovered input. Export is disabled
after firearm handling is overridden because the session no longer represents content
handling. Replay payloads are applied by `src/game/replayCommands.ts`,
`applyReplayActionPayload`, and routed by `src/game/play.ts`, `startPlay`. Hand-changing
order follows `src/game/playerTickActions.ts`, `PlayerTickActions`. Export and replay state
are handled by `src/game/inputReplay.ts`, `withReplayExportGuard`, `InputReplayRecorder`,
and `replayStateFingerprint`.

Each replay segment starts with the play state that changes recorded-action
routing or shot resolution but is not part of the save snapshot: throwing stance, held
readiness, ADS and whether the inventory modal is open. `src/game/play.ts`,
`captureReplayStartState`, captures that state at each window boundary, and
`createReplayPlayStateBinding` restores it before replay. ADS changes a shot's origin and
direction, so a replay must restore it; inventory tab selection changes presentation only
and stays outside replay state. Reading-screen state also stays out: `play.ts`,
`samplePlayerInput`, replays whether world input is active each tick, while `modalCommand`
routes reading navigation and close commands to the presentation-only reader. A replay need
not reopen a particular readable or restore its scroll position. Viewer blur, visibility loss,
pointer-lock changes and mouse clicks do not cancel or alter replayed readiness, ADS or
dominant-hand use, because those events are not part of the recorded session. Live play still
cancels held input on focus loss.

## Readiness and melee (2026-10-05, #267)

Firearms fire only while ready and never while sprinting. Ready movement is a
skill-scaled duck-walk that stacks with crouch pace. Holding the rebindable
`stance.ready` action raises a firearm or enters en-garde; the rebindable
`aim.ads-toggle` action toggles the sight line while a firearm is raised; their
defaults are rows in `INPUT_BINDINGS`. Blocking also requires the
back movement action and succeeds according to melee skill. An
unready firearm click does nothing, including no refusal sound. BR settled the
skill split: “The FC affects stuff like duck walking, whereas MC affects
blocking”. See [SLICE-3.md](SLICE-3.md), 3.1,
`src/game/firearmHandling.ts`, `fireReason`, `src/game/input.ts`, `Input`, and
`src/game/melee.ts`, `shouldEnterMeleeReady`; `POINTER_ACTIONS` in
`src/game/inputBindings.ts` describes the mouse actions, while the registry owns
keyboard bindings.

## Throwing stance

Tap T to toggle throwing stance; holding it through the authored real-time threshold drops one held item, choosing off hand before dominant hand, without toggling. The hold gesture separates a deliberate drop from the stance toggle, and T keeps its separate inventory quick-move role. In stance, hold mouse-1 to charge and release to throw; the off-hand item takes priority, mouse-1 never fires a firearm, and right mouse cancels a charge. The stance remains after a throw while either hand is occupied and ends when both are empty. T tap exits and cancels an active charge. The raised, drawn-back held-item pose makes the stance legible without a HUD cue; the optional THROW hint follows the interaction HUD setting. R is ignored rather than queued during charge, so a held throw cannot unexpectedly start a reload, rack or magazine removal after it ends. See `src/content/base/senses.json`, `throwStanceDropHoldRealSeconds`, `src/core/heldPose.ts`, `throwStanceHandOffset`, `src/render/hands.ts`, `HeldItems`, `src/game/pressHoldInput.ts`, `PressHoldInput`, `src/game/play.ts`, `toggleThrowingStance`, `beginItemThrow`, `finishItemThrow`, `reloadBinding`, and `throwStanceCueVisible`.

## Remaining questions

1. Press-and-hold for every long use remains a direction, not a universal
   cancellation rule. Do not redesign mouse use as part of rebinding.
2. Best-pocket's default remains BR's decision; its entry is authoritative in
   the registry, not duplicated here.
3. Lean and magazine-check inputs are added only when their mechanics land,
   against the whole conflict model.
4. Whether matches strike alone is open for BR; the question came out of the
   #252 re-look (2026-10-05 13:44).
