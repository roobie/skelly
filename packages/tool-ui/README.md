---
read_if:
  - you change how the authoring tools draw an assembly in three.js
  - you add a part shared by the thing and gun authoring tools' interfaces
  - you decide whether code belongs in the construct package or in the tool UI
  - you share orbit controls or a minimal authoring preview
  - you change camera persistence or assembly parameter editing
---

# Tool UI

Interface parts shared by the authoring tools. It sits above `packages/construct` and may
import any of its layers; construct never imports it, which keeps three.js out of construct.

Scene conversion belongs below the tools so domain views can add layers without copying
rendering mechanics; see `src/scene.ts`, `buildLayers`. Renderer injection keeps tests
independent of a browser.

Orbit controls live here so tools do not copy input handling or acquire each other's
viewer dependencies; see `src/orbit.ts`, `createOrbitControls`. A minimal preview shares
scene and framing setup through `src/preview.ts`, `createPreview`, while an authoring
tool still owns which assembly it displays.

Camera persistence and assembly parameter state belong here because neither depends on
firearm policy; see `src/cameraState.ts`, `parseCameraState` and `src/paramPanel.ts`,
`buildPanelModel`. Catalogue selection, design persistence and export eligibility stay in
the owning tool: sharing parameter mechanics must not impose the gun editor's choices
on the thing editor. Gun ammo and cycle views remain domain-owned for the same reason.
