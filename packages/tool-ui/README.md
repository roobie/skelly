---
read_if:
  - you change how the authoring tools draw an assembly in three.js
  - you add a part shared by the thing and gun authoring tools' interfaces
  - you decide whether code belongs in the engine or in the tool UI
  - you share orbit controls or a minimal authoring preview
---

# Tool UI

Interface parts shared by the authoring tools. It sits above the engine and may import any
engine layer; the engine never imports it, which keeps three.js out of the engine.

`src/scene.ts`, `buildLayers` converts a validation report into three.js groups. This is
the shared conversion of engine types to three.js types; a tool may add its own layers on
top. Its renderer is injected so tests and tools can run without a browser.

Orbit controls live here so tools do not copy input handling or acquire each other's
viewer dependencies; see `src/orbit.ts`, `createOrbitControls`. A minimal preview shares
scene and framing setup through `src/preview.ts`, `createPreview`, while an authoring
tool still owns which assembly it displays.
