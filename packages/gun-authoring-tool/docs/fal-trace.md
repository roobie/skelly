---
read_if:
  - you author the FAL replacement and need its settled scope or reference limits
  - you interpret the FAL reference trace or its provisional scale
  - you choose references for FAL detail parts, iron sights or an optional optic mount
---

# FAL profile study

## Purpose and boundary

Trace before modelling so a plausible generic rifle does not become the shape reference for its own correction. The FAL is an authored GAT look-alike replacing the legacy battle-rifle archetype (`things/README.md`, "Rules"), not a new shared generator family. A close resemblance is preferred; exact variant reproduction is not required. This study establishes an appearance reference, not manufacturing geometry or a claim that geometry, handling or exports have been implemented. Folding charging-handle motion remains outside this study (#648); working stock folding is in scope.

The supplied photograph and photo overlays stay outside the repository, like the AK reference (`../PROJECT.md`, "Design and variants"). The [trace record](../references/fal-profile.trace.json) owns calibration, picked landmarks, provenance and uncertainty; the [visible-edge SVG](../references/fal-profile.svg) owns contour vertices. Open paths deliberately leave obscured boundaries unresolved. Do not infer depth, hidden interfaces or internal action dimensions from this side profile. Shared tracing policy and its reasons are in `tracing.md`.

## Identification and calibration

A metric-pattern FAL Para-family rifle is the high-confidence identification. A carry-handle short Para is the closest working identification, but exact maker, receiver subtype and barrel length cannot be established from the photograph. The carry handle argues against an unmodified carry-handle-less short Para; lower material appearance cannot distinguish otherwise similar variants. Green tape and wear are not variant evidence.

The record retains conflicting secondary-source barrel figures rather than combining them into a supposedly exact specification. Neither the working identification nor a candidate overall length establishes the photographed rifle's provenance. An extrapolated overall length remains an assumption, not a sourced measurement.

The sight radius is provisional because the barrel breech and muzzle crown cannot be located reliably through the receiver and muzzle device. Picked sight-assembly centres are silhouette proxies, not resolved aperture/post centres. A generic fixed-stock overall length would miscalibrate this Para. Derived overall spans and candidate-scale comparisons are not independent known dimensions; see `../src/gun/traceRecord.ts`, `resolveTraceReference`.

The allowance is an authoring allowance, not a statistical confidence interval. Registration/perspective uncertainty does not cover the unknown systematic error of a different sight radius or stock geometry. Visible-envelope estimates must not be promoted to sourced component specifications. Overlaps are less certain than unobstructed contour picks.

## Silhouette interpretation

The muzzle device is distinct from the exposed barrel; hidden barrel length remains unresolved. The front and rear sight tops are protective silhouettes, not the optical sight line. The forend is a shallow slotted shell with a distinct gas block, rather than a generic deep handguard. Partial lower openings do not establish a symmetric hidden vent pattern.

The upper receiver's shallow roof and sloping underside, and the lower's steps at the grip and guard, are stronger cues than a rectangular envelope. The folded carry-handle grip overlaps the forward receiver; its wire return crosses the roof. The original side photograph shows the ejection-port/carry-handle side. Its small circular receiver control is not asserted to be the charging knob. The supplied fixed-stock companion close-up resolves the opposite side's charging knob and slide; it does not independently calibrate the Para or prove its stock or rear-sight variant.

The magazine is nearly straight, not AK-curved. Perspective and unequal insertion depth can explain apparent wedge; the photograph does not establish a curved centreline. Its ribs and sloping base matter to the silhouette, but the hidden top is not reconstructed and apparent capacity is not measured. The grip's rearward rake and sloping heel are stronger cues than a generic vertical grip. The stock consists of separate tubes around a triangular void, not a solid wedge; its elbow, hinge, brace and raked buttplate must remain distinguishable.

## Comparison boundary

Compare the loaded curated design, not a fresh random battle rifle: `../designs/archetype-battle-rifle.json`, `assembly`. Native physical scale matters because stretching panels to equal overall length would hide the stock/receiver proportion error; see `../src/gun/units.ts`, `GUN_UNITS`, and `../src/cli/traceOverlay.ts`, `main`. Broad envelopes can be compared across sides, but controls cannot: distinguish the original photograph's ejection-port side from the companion's charging-handle side. Registration at the receiver/barrel interface is not proof of fit. Photo perspective remains unrectified; the projection is a geometry comparison, not a material render.

## Settled authoring scope

The target replaces the legacy battle rifle as an authored design. Its stock, handguard, receiver and iron sights are authored for this gun, not drawn from a shared Para family; reuse is a later choice when another design needs it. Model working stock folding, including hinge, clearance and export, rather than a decorative static folding-stock outline. Include handguard slots, magazine ribs, carry handle, charging handle and sling loop with their proper part ownership. Keep the photo iron sights and support an optional optic as a real fitted attachment. Use clean dark metal and polymer: incidental tape and wear are not the target finish.

## Detail references and remaining limits

- The original side photograph supplies handguard-slot placement, carry-handle outline, sling-loop silhouette and Para sight envelopes. The companion receiver close-up supplies the charging knob, slide, magazine ribs and receiver steps; it does not replace the Para stock or specify its rear sight.
- The [FN operator's manual](https://www.forgottenweapons.com/wp-content/uploads/manuals/FN-FAL%20Manual.pdf), "HANDGUARD", "CARRYING HANDLE", "FRONT SLING SWIVEL", "FORESIGHT", "COCKING HANDLE" and "BACKSIGHT", distinguishes the relevant components. Its fixed-stock dimensions and rear-sight graduation do not establish Para dimensions or a particular Para rear-sight variant. Its cocking handle does not move when the rifle fires, so a carrier-owned reciprocating knob is not a faithful default.
- [DS Arms original FN Para stock](https://dsarms.com/product/original-fn-herstal-production-fn-fal-folding-para-buttstock-new-old-stock/) supplies an independent stock/connector reference. [Para stock discussion](https://www.falfiles.com/threads/how-to-fold-a-para-stock.289333/) distinguishes latch variants and describes right-side folding; it is owner evidence, not a dimensioned hinge specification. A side photograph cannot resolve lateral offset, travel or swept clearance. Validate those in the authored assembly rather than assuming a flat side-view rotation.
- [DS Arms Para optic mount](https://dsarms.com/product/dsa-fal-sa58-extreme-duty-scope-mount-standard-length-para-acog-cut-model-includes-hardware-dsa-fal-sa58-extreme-duty-scope-mount-standard-length-para-acog-cut-model-includes-hardware/) provides a concrete optional-mount reference: a Para-compatible replacement top cover with receiver-top rail and an optic seating provision. The smooth photo cover is not itself an exposed rail. This source establishes a plausible mount location, not a fitted attachment or permission to reuse an AR mount without checking it.

The unresolved matters are reference precision and implementation fit, not requests to reopen the settled identity, fold scope, detail budget, sights or finish. Exact maker/variant, sourced receiver dimensions, hinge lateral offset and final optic seating remain unknown.
