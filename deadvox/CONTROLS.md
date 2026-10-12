---
read_if:
  - you change player or debug input bindings or their labels
  - you change input ownership, browser-native behavior or pointer actions
  - you change stances, firearm handling, throwing, treatment or long-action controls
  - you change how the HUD toggle or quickbar gestures work
---

# Controls and input ownership

Read with [INTERFACE.md](INTERFACE.md), especially “Text” and
“Combat and feedback”. The binding registry is authoritative for gameplay chords and their displayed labels. Character-screen tabs and the Items layout are in [inventory-layout](docs/inventory-layout.md).

## Ownership

A visible context owns attention: menus, reading, inventory and debug modals shield gameplay even if no widget consumes a key. Availability, reach, ammunition and refusal remain with gameplay owners. See `src/game/inputBindings.ts`, `KeyboardInput`, and `src/game/play.ts`, `startPlay`.

The browser keeps native text entry, IME, selection, clipboard and focus traversal. Deadvox does not duplicate a text editor or browser focus engine. The binding registry refuses Ctrl, Cmd/Meta and Alt as game modifiers because the browser and operating system own those shortcuts. Synthetic events do not prove immunity from desktop interception. In pointer-locked menus, the drawn cursor handles controls that native pointer lock cannot operate, such as range dragging.

Physical key positions define bindings; labels follow the browser's keyboard layout. Rebinding must consider alternate bindings and held gates so a hidden conflict cannot steal movement or run two actions. See `BindingRegistry` and `bindingConflict` in `src/game/inputBindings.ts`.

The wheel is not a keyboard chord. In play it steps the wielded item's action; in a menu it scrolls the pane under the drawn cursor, including at the pane's edge. Elsewhere the game leaves it to the browser. See `src/ui/menuPointer.ts`, `mountMenuPointer`.

Bindings are origin-local browser-profile preferences, not saved-character or account state. Stored rows are untrusted and invalid entries are dropped rather than becoming controls. See `src/game/inputBindings.ts`, `BindingRegistry`.

## Settled controls

- **Debug authoring** uses the held debug gate. The review map and freeze action use debug bindings; the gate is itself a binding, not a browser modifier. Noclip flight is ungated only while noclip is active so flight can be controlled without occupying another hand. Spawn-menu navigation is modal navigation, not authoring. See `src/game/inputBindings.ts`, `INPUT_BINDINGS`, and `src/game/play.ts`, `toggleReviewMap`.
- **Q and E** remain reserved physical positions across contexts; do not add placeholder lean actions.
- **Inventory quick action** is a rebindable hold-and-click shortcut for moving an item; it saves clicks, not handling time, and never activates the item. See `src/game/inputBindings.ts`, `inventory.quick-action-gate`, and `src/ui/inventoryScreen.ts`, `quickMove`.
- **Loose-item pickup** uses the world-interaction action: tap wears a back-wearable or slings a suitable long gun when its slot is free, otherwise pockets it; holding wields it. Doors and containers retain tap interaction. A shared reach/target choice routes the action through ordinary inventory handling, so pickup retains its handling time. See `src/game/play.ts`, `interactionTargetAt` and `completeWorldInteraction`.
- **Slinging** uses the inventory wear/remove action; a quickbar tap draws or puts away a slung gun. Wielding another item may stow a sling-fitted long gun in a free shoulder slot. A separate sling key would duplicate existing routes. See `src/game/inputBindings.ts`, `inventory.wear`, and `src/core/options.ts`, `quickbarPutAway`.
- **Downed bodies** use the same world-interaction tap/hold: tap finishes a body, hold dismembers it. The nearest-target rule applies to bodies and ground items. See `src/core/interactionPick.ts`, `pickInteractionTarget`.
- **The main menu** opens through its menu binding; Escape releases pointer lock during play and toggles the menu after death. Escape is not rebindable. F10 belongs to the browser.
- **Reload gestures** share one rebindable action. Hold selects the fullest carried magazine that fits, even if it has fewer rounds than the fitted magazine. A double press racks; a tap followed by a held press removes a detachable magazine. A single tap does nothing. Classification waits for release or the hold threshold, so a quick double tap and a plain hold do not remove a magazine. A non-detachable firearm racks repeatedly while the reload action remains held. See `src/game/reloadInput.ts`, `ReloadInput`, and `src/game/firearmHandling.ts`, `FirearmMechanics`.
- **Rest and sleep** have no dedicated keys. Use eligible furniture through world interaction; Wait is a character-screen button. The alarm's wake hour is a setting, not a sleep key. See `src/game/play.ts`, `startPlay`, and `src/game/rest.ts`, `RestController`.
- **Use items** from the hand or quickbar. There is no dedicated inventory-use action. An ammunition box is wielded and activated to unpack. See `src/game/primaryAction.ts`, `selectPrimaryAction`.
- **Handedness** is actor identity, not a chord swap or physical-slot migration. See [character-handedness](docs/character-handedness.md).
- **Quickbar tap** takes an item into its capability-directed hand or puts it away; hold uses an available action. It does not provide an alternate route for firearm racking. See `src/game/quickbarInput.ts`, `QuickbarInput`, and `src/game/quickbarActions.ts`, `QuickbarActions`.
- **Primary actions** from either hand are refused while handling is busy. One-handed work leaving the free hand usable remains an open decision.
- **Treatment** uses a wielded treatment item or its held quickbar slot. The wheel selects the wielded action, which begins with the worst bleeding. Treatment is a normal-speed action that leaves movement free; bleeding refuses time compression. See `src/game/itemActions.ts`, `defaultItemAction`, and `src/core/body.ts`, `Body.compressionRefusal`.
- **Lighting** requires the matches or other firestarter in hand. A held igniter can light an eligible object in the other hand; an igniter merely within reach does not qualify.
- **HUD toggle** is a rebindable hold. It hides the HUD without changing individual option values. A tap remains available for third-person camera gestures and the debug panel. See `src/game/inputBindings.ts`, `hud.toggle`, and `src/game/backquoteOrbitGesture.ts`, `BackquoteOrbitGesture`.
- **Throw stance** is a toggle; holding through its authored threshold drops one held item without toggling. In stance, hold the primary pointer action to charge and release to throw; the secondary pointer action cancels. The stance remains while either hand is occupied. The reload action does not queue during a charge, so a held throw cannot unexpectedly start firearm handling afterward. See `src/game/throwCharge.ts`, `ThrowCharge`, and `src/game/play.ts`, `beginItemThrow`.
- **Continue** is shared after interruption or a stopped craft.
- **Crouch** is a toggle available only in moving contexts, not menus or noclip; a long action leaves the stance unchanged. Context ownership keeps its input distinct from noclip descent.

## Remaining questions

- Press-and-hold for every long use remains a direction, not a universal cancellation rule. Do not redesign mouse use as part of rebinding.
- Best-pocket's default remains owned by the binding registry, not duplicated here.
- Add lean and magazine-check inputs only when their mechanics exist and the full conflict model has been checked.
- Whether matches strike alone remains open for BR.

## Replay boundary

Input recording samples control state at player ticks so action order does not depend on browser event timing. Replay must restore any held state that changes simulation or shot resolution; presentation-only selection and scroll position do not belong in replay state. Live play still cancels held input on focus loss. See `src/game/inputReplay.ts`, `replayStateFingerprint`, and `src/game/play.ts`, `captureReplayStartState`.
