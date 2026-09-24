# skelly

A greenfield, experimental, multi-modal 3D project. The scope is not limited to
skeletons, anatomy or rigging. It is a place to try out ideas about generating,
assembling and constraining 3D structure.

## Subprojects

| Dir | Status | Summary |
| --- | --- | --- |
| [`gungen/`](gungen/PROJECT.md) | milestone 1.2 done: validator, viewer, six archetypes, params from neighbours | A super-low-poly 3D firearm generator that works out how components connect, so every generated assembly fits together. |

## Shared direction

Subprojects should share the domain-agnostic parts: connection points (ports),
constraints, keep-out volumes, the assembly graph and seeded determinism.
Domain-specific knowledge (gun parts, bones, furniture…) lives in data, not in
the core. The skeleton-rigging roots fit this model: a joint is a port with
degrees of freedom.
