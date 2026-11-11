---
read_if:
  - extracting terrain evaluation from Site implementations during terrain-plan work
  - changing city surface or stamp evaluation
  - separating terrain computation from gameplay ownership
---

# Shared terrain evaluation

## Decision

As each Site terrain mechanism is extracted, it must have one data-parameterized
implementation shared by Site queries and generation. Terrain-plan work is the
trigger for extracting the remaining mechanisms. City meets this rule: see
`src/core/terrainEvaluator.ts`, `createCitySurface` and `stampCityTerrain`;
`src/core/citySite.ts`, `CitySite` delegates city evaluation while retaining
planning and gameplay metadata.

Separating evaluation from Site ownership allows background computation without
rebuilding gameplay state or maintaining a second terrain formula. Extraction
proceeds by mechanism so arithmetic and stamp ordering can be checked independently
before changing generation ownership. Content remains the owner of tuning.

Rectangle-distance predicates and ground-query sampling are not interchangeable:
sharing evaluation must not erase their distinct coordinate and boundary semantics.
Computation alone does not grant ownership of terrain arrival, resident edits or
save state.
