---
read_if:
  - you're changing keyboard routing between the main menu and world actions
  - you diagnose a world action opening behind the main menu
---

# Unhandled menu keys are not world intent

The main menu owns attention even when no widget consumes a key. An unhandled key must not reach gameplay and open another panel or change held-item state behind the menu. Menu and debug handlers may still do their own work; their precedence does not authorize unrelated world actions. A panel changing pause presentation must not resume simulation against the player's intent to remain in the main menu.

See `packages/presentation/src/presentation/inputBindings.ts`, `KeyboardInput.press`, `packages/presentation/src/presentation/play.ts`, `startPlay` and `stepSimulation`, `packages/engine/src/game/simulationStepper.ts`, `createSimulationStepper`, and `packages/presentation/src/ui/menuState.ts`, `computeMenuState`. When changing routing, verify that a world action is refused with the main menu open, not merely that the menu appears.
