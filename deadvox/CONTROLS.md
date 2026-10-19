---
read_if:
  - you change player or debug input bindings, their default keys or their labels
  - you change input ownership, browser-native behavior or pointer actions
  - you change stances, firearm handling, throwing, treatment or long-action controls
  - you change how the HUD toggle or quickbar gestures work
  - you change optic zoom or its wheel ownership
  - you diagnose native keyboard delivery or input refusal
---

# Controls and input ownership

Read with [INTERFACE.md](INTERFACE.md), especially “Text” and
“Combat and feedback”. The binding registry is authoritative for gameplay chords and their displayed labels. Character-screen tabs and the Items layout are in [inventory-layout](docs/inventory-layout.md).

## Ownership

A visible context owns attention: menus, reading, inventory and debug modals shield gameplay even if no widget consumes a key. Availability, reach, ammunition and refusal remain with gameplay owners. See `src/game/inputBindings.ts`, `KeyboardInput`, and `src/game/play.ts`, `startPlay`.

The browser keeps native text entry, IME, selection, clipboard and focus traversal. Deadvox does not duplicate a text editor or browser focus engine. The binding registry refuses Ctrl, Cmd/Meta and Alt as game modifiers, so those chords are never game actions. While playing (pointer locked, no text field focused) the game owns the keyboard and cancels every such chord the page receives, because a stray Ctrl+U or Ctrl+S mid-fight opens a browser window and costs the player the run. Menus and text fields keep native behaviour. No page can cancel Ctrl+W, Ctrl+T or Ctrl+N by default: Chromium delivers them only under the Keyboard Lock API, which works only in page-requested fullscreen. So fullscreen is an opt-in button in the options, and the lock applies only while the page holds fullscreen; where the API is missing (Firefox, Safari) fullscreen still works and those chords stay with the browser. The lock leaves Escape out so a tap still frees the pointer, and the option is not remembered because the browser needs a fresh click to enter fullscreen. See `src/ui/fullscreenOptions.ts`, `syncKeyboardLock`. Synthetic events do not prove immunity from desktop interception. See `src/game/inputBindings.ts`, `KeyboardInput`, `install`. In pointer-locked menus, the drawn cursor handles controls that native pointer lock cannot operate, such as range dragging.

Physical key positions define bindings; labels follow the browser's keyboard layout. A modifier's own physical edge takes precedence over its aggregate flag because inconsistent edge flags must not disable unrelated movement. This does not authorize reconstructing other missing key events. Rebinding must consider alternate bindings and held gates so a hidden conflict cannot steal movement or run two actions. See `src/game/inputBindings.ts`, `KeyboardInput`, `BindingRegistry` and `bindingConflict`.

The wheel is not a keyboard chord. Menus keep their scroll ownership so aiming cannot steal a pane's input. Variable-optic ADS takes precedence over wielded-item action selection during play; fixed optics and non-ADS play leave that route alone. See `src/game/play.ts`, `startPlay`; `src/game/opticZoom.ts`, `OpticZoom.wheel`; and `src/ui/menuPointer.ts`, `mountMenuPointer`.

Bindings are origin-local browser-profile preferences, not saved-character or account state. Stored rows are untrusted and invalid entries are dropped rather than becoming controls. See `src/game/inputBindings.ts`, `BindingRegistry`.

Default keys are content, and only the base pack's: the game reads them from the base file alone, so validation refuses a `controls` row from any other pack rather than let a mod's keys pass and be ignored. Mods, packs and a gamepad layout setting defaults is left open until d472, which the first mod needing to change a default key or the gamepad layout table triggers. Actions, contexts, gestures and gates stay in code, so replay, which records only command ids and contexts, stays stable. A player's stored rebind overrides the default by action id. Changing a default therefore moves the key for every player who has not rebound that action. Validation also refuses an action with no default key, an unknown action id, an invalid key code, a Ctrl, Cmd/Meta or Alt modifier, and a default-key conflict, which it finds with `bindingConflict` itself. The checks run in the validate CLI, not in `src/core`, because actions are game code and the simulation graph must not import them. See `src/content/base/controls.jsonnet`, `src/cli/controlIssues.ts`, `controlIssues`, `src/game/inputBindings.ts` and `defaultKeySetIssues`.

## Settled controls

- **Debug authoring** uses the held debug gate. The review map and freeze action use debug bindings; the gate is itself a binding, not a browser modifier. Noclip flight is ungated only while noclip is active so flight can be controlled without occupying another hand. Spawn-menu navigation is modal navigation, not authoring. See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and `src/game/play.ts`, `toggleReviewMap`.
- **Q and E** remain reserved physical positions across contexts; do not add placeholder lean actions.
- **Inventory quick action** is a rebindable hold-and-click shortcut for moving an item; it saves clicks, not handling time, and never activates the item. See `src/game/inputBindings.ts`, "inventory.quick-action-gate", and `src/ui/inventoryScreen.ts`, `quickMove`.
- **Loose-item pickup** uses the world-interaction action: tap wears a back-wearable or slings a suitable long gun when its slot is free, otherwise pockets it; holding wields it. Doors and containers retain tap interaction. A shared reach/target choice routes the action through ordinary inventory handling, so pickup retains its handling time. See `src/game/play.ts`, `interactionTargetAt` and `completeWorldInteraction`.
- **Slinging** uses the inventory wear/remove action; a quickbar tap draws or puts away a slung gun. Wielding another item may stow a sling-fitted long gun in a free shoulder slot. A separate sling key would duplicate existing routes. See `src/game/inputBindings.ts`, `inventory.wear`, and `src/core/options.ts`, `quickbarPutAway`.
- **Downed bodies** use the same world-interaction tap/hold: tap finishes a body, hold dismembers it. The nearest-target rule applies to bodies and ground items. See `src/core/interactionPick.ts`, `pickInteractionTarget`.
- **The main menu** opens through its menu binding; Escape releases pointer lock during play and toggles the menu after death. Escape is not rebindable. F10 belongs to the browser.
- **Reload, rack, remove** share one rebindable action. Hold selects the fullest carried magazine that fits, even if it has fewer rounds than the fitted magazine. A double press racks; a tap followed by a held press removes a detachable magazine. A single tap does nothing. Classification waits for release or the hold threshold, so a quick double tap and a plain hold do not remove a magazine. A pump racks repeatedly while the reload action remains held. A revolver hold opens the crane, preserves live rounds while clearing cases, and loads loose rounds until release; release finishes the current step and closes the crane. Double press cocks a closed revolver or closes an open crane. Tap-then-hold deliberately dumps the cylinder and leaves it open. See `src/game/reloadInput.ts`, `ReloadInput`, and `src/game/firearmHandling.ts`, `FirearmMechanics`.
- **Rest and sleep** have no dedicated keys. Use eligible furniture through world interaction; Wait is a character-screen button. The alarm's wake hour is a setting, not a sleep key. See `src/game/play.ts`, `startPlay`, and `src/game/rest.ts`, `RestController`.
- **Use items** from the hand or quickbar. There is no dedicated inventory-use action. An ammunition box is wielded and activated to unpack. See `src/game/primaryAction.ts`, `selectPrimaryAction`.
- **Handedness** is actor identity, not a chord swap or physical-slot migration. See [character-handedness](docs/character-handedness.md).
- **Quickbar tap** takes an item into its capability-directed hand or puts it away; hold uses an available action. It does not provide an alternate route for firearm racking. See `src/game/quickbarInput.ts`, `QuickbarInput`, and `src/game/quickbarActions.ts`, `QuickbarActions`.
- **Primary actions** from either hand are refused while handling is busy. Whether one-handed work leaves the free hand usable remains open for BR's decision.
- **Treatment** uses a wielded treatment item or its held quickbar slot. The wheel selects the wielded action, which begins with the worst bleeding. Treatment is a normal-speed action that leaves movement free; bleeding refuses time compression. See `src/game/itemActions.ts`, `defaultItemAction`, and `src/core/body.ts`, `Body.compressionRefusal`.
- **Lighting** requires the matches or other firestarter in hand. A held igniter can light an eligible object in the other hand; an igniter merely within reach does not qualify.
- **HUD toggle** is a rebindable hold. It hides the HUD without changing individual option values. A tap remains available for third-person camera gestures and the debug panel. See `src/game/inputBindings.ts`, `hud.toggle`, and `src/game/backquoteOrbitGesture.ts`, `BackquoteOrbitGesture`.
- **Worn lights** share one rebindable hold so lights outside the hands need no separate controls. If any worn source is off, the hold requests all on; otherwise it requests all off. This avoids cycling and makes the result predictable. Hand and worn beams coexist, including in zombie sight: more light also means more exposure and GPU cost. Keep the render pool content-bounded so extra sources cannot grow shader work without limit. See `src/game/survival.ts`, `toggleWornLights`, `src/core/lights.ts`, `inventoryLightSources`, `src/render/flashlight.ts`, `Flashlight`, and `src/core/schema.ts`, `SenseSchema`. The debug fog key can share the physical key because it needs the debug gate; see `src/game/inputBindings.ts`, "light.worn-toggle".
- **Throw stance** is a toggle; holding through its authored threshold drops one held item without toggling. In stance, hold the primary pointer action to charge and release to throw; the secondary pointer action cancels. The stance remains while either hand is occupied. The reload action does not queue during a charge, so a held throw cannot unexpectedly start firearm handling afterward. See `src/game/throwCharge.ts`, `ThrowCharge`, and `src/game/play.ts`, `beginItemThrow`.
- **Continue** is shared after interruption or a stopped craft.
- **Crouch** is a toggle available only in moving contexts, not menus or noclip; a long action leaves the stance unchanged. Context ownership keeps its input distinct from noclip descent.
- **Carrying** is its own input context while a piece of furniture is in the hands, and its turn and tip actions take reload's and throw's keys there. A context keeps those keys inside the binding registry, so rebinding, binding-made labels and replay treat them like any other action, and the turn key matches the inventory's rotate. Reload and throw need hands the carry already fills, so they have nothing to lose. One active context can't describe states that combine. Carrying never meets climbing, because the hand authority refuses a lift on a ladder and a climb while carrying, but a mode that can overlap another, such as a vehicle or the ready stance, needs a precedence rule rather than a context per pair. See `src/game/inputBindings.ts`, "carry.turn", and `src/game/play.ts`, `playContext`.

## Remaining questions

- Press-and-hold for every long use remains a direction, not a universal cancellation rule. Do not redesign mouse use as part of rebinding.
- BR decides the default best-pocket destination; the binding registry is authoritative for the configured choice and its displayed behavior.
- Add lean and magazine-check inputs only when their mechanics exist and the full conflict model has been checked.
- Whether matches strike alone remains open for BR.

## Native key diagnostics

Native delivery failures cannot be inferred from synthetic events or movement alone. Opt-in debug tracing keeps event admission and cancellation evidence together without collecting typed text. The bounded diagnostic buffer stays outside saved and replay state so observing a refusal cannot change simulation identity. See `src/game/inputBindings.ts`, `KeyboardInput`, and `src/debug/keyTrace.ts`, `KeyTrace`.

## Replay boundary

Input recording samples control state at player ticks so action order does not depend on browser event timing. Replay must restore any held state that changes simulation or shot resolution; presentation-only selection and scroll position do not belong in replay state. Live play still cancels held input on focus loss. See `src/game/inputReplay.ts`, `replayStateFingerprint`, and `src/game/play.ts`, `captureReplayStartState`.
