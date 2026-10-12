---
read_if:
  - you're changing keyboard routing between the main menu and world actions
  - you diagnose a world action opening behind the main menu
---

# Unhandled menu keys are not world intent

The main menu owns attention even when no widget consumes a key. An unhandled key must not reach gameplay and open another panel or change held-item state behind the menu. Menu and debug handlers may still do their own work; their precedence does not authorize unrelated world actions.

See `src/game/inputBindings.ts`, `KeyboardInput.press`, and `src/game/play.ts`, `startPlay`. When changing routing, verify that a world action is refused with the main menu open, not merely that the menu appears.
