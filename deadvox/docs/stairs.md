---
read_if:
  - you're authoring multi-storey templates, stairs or root cellars
  - you're changing floor-opening validation, stair traversal or site lighting
  - you're changing asynchronous lighting pixel comparisons or dense-camp browser evidence
  - you're changing cross-floor zombie behavior or its browser witness
---

# Explicit storeys, stairs and root cellars

ASCII layers remain the floor plans. Optional named storeys and stair access generate ordinary blocks for a flight, avoiding hand-maintained treads and overhead holes across layers. The generated blocks, not a separate route object, are placed in the site. See `src/core/stairFlight.ts`, `planFlight`, and `constructFlight`.

Template coordinates are blocks; site placement remains in metres. Storey height is standing-feet height, while layer indices identify support layers. Placement lowers the template origin for below-ground floors. Air cells in the authored template carve the cellar consistently, including across chunk borders; the surrounding terrain and structure remain. See `src/core/templates.ts`, `compileTemplate`, and `src/core/authoredSite.ts`, `AuthoredSite.stamp`.

Validation checks standing clearance and reachable floor space through openings, doors and stairs. This is a construction check, not runtime pathfinding. Doors remain openable for validation, while other solid furniture blocks a route. An upper-floor opening must stay inside the incoming flight's footprint and headroom, or it leaves a gap at the top of the stairs. See `src/core/templateSpatial.ts`, `upperFloorOpeningIssues`.

Buried rooms need world-derived sky visibility because wide ambient occlusion retains a nonzero ambient floor. Cellars share the site-structure discovery path with above-ground rooms; a below-ground template flag is not a lighting selector. Fields remain local to their geometry rather than spanning empty gaps. Conservative readiness and limited residency can darken a distant room, so the witness must prove both local darkness and correct field selection. This is bounded diffuse transport, not photometry. A material comparison must wait for its sampled fields to complete, otherwise successive screenshots can mistake readiness changing for a material or ambient-occlusion defect. Initial mesh readiness remains independent of lighting completion. See `src/core/skyTransport.ts`, `buildSkyResult`, and `test/browser/stairs.mjs`, `lightingCellarProofs`.

Shamblers do not navigate stairs as routes. A resident can drift onto a flight while beelining, but a target on another floor does not grant stair knowledge. Door bashing remains deferred under #273 until mob and obstacle strength exist. See `src/core/zombies.ts`, `ZombieSystem.tick`.

The outdoor flow measures the dense camp on a separate, unmodified playtest site so fixture geometry cannot improve its numbers. Frame-service evidence includes sky texture, uniform and program submission, not just the cooperative preparation loop. Job tracing distinguishes candidate selection, snapshot preparation, shared-pool admission, worker execution and publication; dispatch and return gaps also contain delivery and scheduling, so they are not pure transfer timings. An instrumented software-renderer run cannot partition its slowdown from reference-hardware latency. See `test/browser/sky-timing.mjs`, `summarizeSkyTiming`. Report camera-exposure fallback episodes that end before completion as censored, rather than dropping slow work from the denominator. Timings are evidence for BR's gate judgment, not default timing assertions. See `test/browser/sky-measurement.mjs`, `measureSkyRoute`.

The stairs site is a demonstration fixture, not the final Beat 1 house or Dad's Beat 3 cabin. Browser traversal proves player physics with noclip off; lighting checks are separate pixel witnesses. A screenshot alone does not prove floor support. Ladders and roof hatches remain a separate design in [DESIGN.md](../DESIGN.md).
