---
read_if:
  - you change how the authoring tools draw an assembly in three.js
  - you add a part shared by the thing and gun authoring tools' interfaces
  - you decide whether code belongs in the engine or in the tool UI
---

# Tool UI

Interface parts shared by the authoring tools. It sits above the engine and may import any
engine layer; the engine never imports it, which keeps three.js out of the engine.

`src/scene.ts`, `buildLayers` converts a validation report into three.js groups. This is
the shared conversion of engine types to three.js types; a tool may add its own layers on
top. Its renderer is injected so tests and tools can run without a browser.
