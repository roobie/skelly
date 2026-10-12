---
read_if:
  - you're changing forest or hedge movement, sight, sound or rendering rules
  - you're revisiting the forest workload or its performance evidence
---

# Forest behavior and workload

Forest geometry and density are gameplay constraints, not performance knobs to reduce without evidence. Leaves and hedges are passable but opaque: movement, attacks and hearing follow solidity; sight and aim follow opacity. Leaf litter remains walkable. Furniture and doors keep their existing entity semantics. See `src/core/collision.ts`, `worldSolid` and `worldOpaque`, and `src/content/base/blocks.json`.

Brushing an actual leaf or hedge body-overlap cell may admit a positioned rustle through the ordinary sound/hearing path. It is not emitted every frame, stillness produces none, and small contact correction is not meaningful movement. The bundled leaf-rustle asset is a placeholder, not a field recording. See `src/core/vegetation.ts` and `src/game/session.ts`, `SessionAudio`.

Keep forest density, geometry and route workload stable while measuring renderer changes. Software rendering does not establish reference-GPU performance. A cutout experiment did not establish a reliable budget advantage, so opaque drawing remains. Issue #187 is the trigger for revisiting foliage and ground-level visibility.
