---
read_if:
  - you change keyboard routing between the main menu and world actions
  - you diagnose actions or reading panels opening behind the main menu
---

# Unhandled menu keys are not world intent

The main menu owns the player's attention even when no widget consumes a
particular key. Falling through to a world action can open another panel or
change held-item state behind the menu. A panel that changes pause presentation
can also resume the world despite the player's intent to remain in the menu.

Menu and debug handlers can have legitimate work to perform while the menu is
open. Their precedence must not imply permission for an otherwise unhandled key
to reach gameplay.

See `src/game/inputBindings.ts`, `KeyboardInput.press`, and
`src/game/play.ts`, `startPlay`, for contextual resolution before gameplay dispatch.
When changing that routing, verify world-action refusal with the main menu open,
not only that the menu itself appears.
