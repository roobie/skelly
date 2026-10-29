---
read_if:
  - you're evaluating parked fitted-part box collision against cell or solver queries
  - you're extending or removing the experimental vehicle-box path
---

# Parked box query experiment

The experiment is deliberately opt-in: changing every physical consumer before comparing
alternatives would turn a feasibility measurement into a gameplay decision. See
`src/game/play.ts`, `startPlay`, and `src/game/session.ts`, `createSession`, for the debug
gate; `src/core/vehicleBoxes.ts`, `VehicleBoxes`, for the query owner; and
`src/bench/vehicle-boxes-cpu.mjs` for the reproducible workload. The experiment does not
select a driving solver or change the default parked rule.

Exported fitted geometry is the authority. A spatial bucket may nominate a candidate,
but cannot turn the empty space beside it into an obstacle. The fidelity fixture in
`test/vehicleBoxes.test.ts` uses its own thin panel so content tuning cannot silently
change the gap being compared.

## Temporary shortcuts and adoption gate

This branch is for comparison, not merge. Its deliberately partial routing is tech debt
if retained: movement and probes, aimed placement rays and throw flight can disagree
with stance/lean clearance, reach obstruction, firearm hits, zombie sight and combat,
furniture motion, inventory landing, blast and fragment rays, gore and presentation
ragdoll ground. Full adoption must replace the remaining rounded rejections together;
otherwise an open physical gap still has invisible walls in other interactions.

Reusing the existing endpoint-based shape contact search is another shortcut. Thin parts
can be crossed between movement endpoints; point-sampled throws have the same limitation.
Adoption needs swept contact and a defined initial-overlap policy rather than smaller
arbitrary simulation steps. Shape search also uses the actor solver's sideways contact
tolerance rather than exact face snapping. Compare that error before accepting contact
feel. Throw settling and placement destinations remain cell-owned; changing those is a
separate gameplay contract, not permission for this experiment to invent sub-cell piles.
BR must choose between cell piles and vehicle-surface piles before surface landing is adopted.

Rebuilding the entire derived index after any collection revision saves implementation
work but redoes unrelated vehicles. Retaining it creates update-cost debt; adoption
needs per-vehicle invalidation. The allocating candidate sets, bounds and body-shape
wrappers likewise trade implementation speed for query cost; they need profiling and
scratch storage before a performance claim about an optimized implementation.

The debug branch keeps both cell and box owners alive. Adoption needs one shared physical
query owner, channel policy and invalidation boundary, not two competing answers. The
box channel filter is available at its query owner, but the experiment does not route
all channel consumers. Existing actor shapes remain in use for movement; copied local
probes use body envelopes, so exact amalgam probe fidelity still needs a dedicated seam.

The benchmark uses box actor movement/probe envelopes, not zombie perception,
actor-pair separation, rendering, streaming or a city simulation.
It is a bounded collision-frame comparison workload, not a frame-rate guarantee. Broad-phase tuning and solver alternatives must reuse that workload
before comparing timings. Build cost itself is not tech debt; see `GLOSSARY.md`, "Tech debt".
