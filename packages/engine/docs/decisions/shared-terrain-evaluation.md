---
read_if:
  - extracting terrain evaluation from Site implementations
  - changing city surface or stamp evaluation
  - separating terrain computation from gameplay ownership
---

# Shared terrain evaluation

## Decision

Terrain mechanisms have one data-parameterized implementation, shared by Site
queries and generation. See `src/core/terrainEvaluator.ts`, `createCitySurface`
and `stampCityTerrain`; `src/core/citySite.ts`, `CitySite` delegates city evaluation
while retaining planning and gameplay metadata.

Separating evaluation from Site ownership allows background computation without
rebuilding gameplay state or maintaining a second terrain formula. Extraction
proceeds by mechanism so arithmetic and stamp ordering can be checked independently
before changing generation ownership. Content remains the owner of tuning.

Rectangle-distance predicates and ground-query sampling are not interchangeable:
sharing evaluation must not erase their distinct coordinate and boundary semantics.
Computation alone does not grant ownership of terrain arrival, resident edits or
save state.
