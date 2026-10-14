---
read_if:
  - you add or use transient world-space debug geometry
---

# Transient world-space debug drawing

Use transient primitives for short-lived spatial diagnostics that would otherwise need a one-off visualizer. Keep producers behind an existing debug group and create the draw owner only in debug mode. Queue lifetimes use frame Real time, so pause and simulation speed do not change their expiry. The bounded queue drops its oldest entry when full; dropped totals help reveal overload. See `src/debug/transientDraw.ts`, `TransientDebugDraw`, and `src/debug/index.ts`, `attachDebugTools`.

The interaction-ray diagnostic shows the active target ray when enabled from Diagnostics. Use the same API for temporary lines, box outlines and point markers; do not add permanent scene objects or a second debug overlay. See `src/game/play.ts`, `updateDebugTargets`.
