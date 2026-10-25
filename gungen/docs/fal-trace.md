---
read_if:
  - you author the FAL replacement and need its settled scope or reference limits
  - you interpret the FAL reference trace or its provisional scale
  - you choose references for FAL detail parts, iron sights or an optional optic mount
---

# FAL profile study

## Purpose and boundary

Trace before modelling so a plausible generic rifle does not become the shape reference for its own correction. The FAL is an authored GAT look-alike replacing the legacy battle-rifle archetype (`../../things/README.md`, "Rules"), not a new shared generator family. A close resemblance is preferred; exact variant reproduction is not required. This study establishes an appearance reference, not manufacturing geometry or a claim that geometry, handling or exports have been implemented. Folding charging-handle motion remains outside this study (#648); working stock folding is in scope.

The supplied photograph and photo overlays stay outside the repository, like the AK reference (`../PROJECT.md`, "Design and variants"). The visible-edge transcription is [`../references/fal-profile.svg`](../references/fal-profile.svg); its path IDs identify the measured regions. Coordinates are original-image pixels, origin top left, muzzle right. Open paths deliberately leave obscured boundaries unresolved. Do not infer depth, hidden interfaces or internal action dimensions from this side profile.

## Identification and calibration

High confidence: a metric-pattern FAL Para-family rifle, with extended tubular side-folding stock, box magazine, synthetic slotted handguard and combination-style muzzle device. Moderate-to-low confidence: a shortened-barrel Para, plausibly 50.62-class or a mixed-parts rifle. Exact maker, receiver subtype and barrel length cannot be established from this image. The carry handle argues against an unmodified Belgian 50.63; 50.61 and lightweight-lower 50.64 cannot be distinguished by material appearance alone. Green tape and wear are not variant evidence.

A 50.62-class carry-handle short Para is the closest working identification; a 50.63-class short Para is also close in overall proportions but differs at the carry handle. Neither label establishes the photographed rifle's provenance. [FN FAL variants and design details](https://en.wikipedia.org/wiki/FN_FAL) lists a 457 mm barrel for 50.62 and a carry-handle-less 440 mm 50.63. [Weaponsystems.net, FN FAL](https://weaponsystems.net/system/1013-FN+FAL) gives the 50.63 as 998 mm extended, 748 mm folded, with a 436 mm barrel and 549 mm sight radius; it gives 50.61/50.64 as 1095 mm extended, 845 mm folded, with 533 mm barrels and the same sight radius. Barrel figures conflict between sources, so do not combine them into a supposedly exact specification or transfer the 50.63 overall lengths to 50.62 as sourced facts. These are secondary references, not a dimensioned drawing of the supplied rifle.

Use that **549 mm Para sight radius provisionally**, because the barrel breech and muzzle crown cannot be located reliably through the receiver and muzzle device. The sight-assembly centres are approximately x=395 and x=1116: 721 px, hence 0.7614 mm/px. These are silhouette proxies, not resolved aperture/post centres. Do not use the generic fixed-stock FAL overall length to calibrate this Para.

The visible overall span, buttplate x=27 to muzzle x=1333, is L=1306 px, provisionally about 994 mm. This is an output of the calibration, not an independent known dimension. The published 50.63 overall length gives 0.7642 mm/px, only about 0.36% larger. A 50.62 extrapolation, shortening the 50.61 totals by its barrel-length difference, gives about 1019 mm extended and 769 mm folded, hence 0.7802 mm/px: about 2.47% larger. Those 50.62 totals are derived assumptions, not published measurements. Neither comparison falsifies the provisional sight-based trace scale; retain that datum for the table rather than silently replacing it with an extrapolation.

Normalized proportions and pixel paths remain unchanged by uniform rescaling. Allow about ±5% for registration/perspective, and a separate unknown systematic error if this rifle has a different sight radius or stock geometry. This is an authoring allowance, not a statistical confidence interval. Local contours are picked to approximately ±3–5 px, with larger uncertainty at overlaps. Actual receiver length, complete height and three-dimensional hinge offsets remain unsourced; visible-envelope estimates must not be promoted to component specifications.

## Trace measurements

Widths and heights are axis-aligned **visible envelope spans**, not part-axis lengths or separated component dimensions. All mm figures are estimates rounded to whole mm. The SVG owns the outline vertices; this table records the proposed visual proportions before implementation.

| Region / SVG path | Pixel envelope x; y | Width/L; height/L | Estimated mm width × height |
| --- | --- | --- | --- |
| Muzzle device / `flash-hider` | 1225–1333; 81–106 | .083; .019 | 82 × 19 |
| Exposed barrel / `barrel` | 1137–1225; 84–101 | .067; .013 | 67 × 13 |
| Gas block and sight / `gas-block-front-sight` | 1068–1141; 28–113 | .056; .065 | 56 × 65 |
| Forend / `handguard` | 757–1078; 47–117 | .246; .054 | 244 × 53 |
| Upper receiver / `upper-receiver` | 375–754; 49–158 | .290; .083 | 289 × 83 |
| Hinge / `stock-hinge` | 306–373; 75–152 | .051; .059 | 51 × 59 |
| Stock including hinge and butt / stock paths | 27–375; 75–249 | .266; .133 | 265 × 132 |
| Upper stock tube / `stock-upper` | 28–305; 91–120 | .212; .022 | 211 × 22 |
| Buttplate / `buttplate` | 27–80; 97–249 | .041; .116 | 40 × 116 |
| Grip / `grip` | 357–499; 140–270 | .109; .100 | 108 × 99 |
| Magazine / `magazine` | 599–706; 133–294 | .082; .123 | 81 × 123 |
| Folded-down carry handle / `carry-handle` | 585–720; 53–109 | .103; .043 | 103 × 43 |
| Trigger and guard / `trigger-guard` | 499–556; 146–191 | .044; .034 | 43 × 34 |

Muzzle-to-butt outline reading:

- The muzzle device is nearly horizontal, with a small step onto the thinner exposed barrel. Ports are visible but their hidden circumferential arrangement is not established. The sling loop hangs below the barrel immediately ahead of the gas block (`sling-loop`).
- The front-sight top reaches y≈28: 66 px or .051L (50 mm) above the provisional bore y≈94. Rear-sight top is also y≈28. These are protective-silhouette heights, **not** the optical sight line. The handguard roof is about 47 px (.036L; 36 mm) above the bore; its floor is about 23 px (.018L; 18 mm) below it.
- The handguard has nearly parallel roof and floor, with rounded end transitions. Three visible upper slots centre near x≈939, 990 and 1041, y≈63. Each is roughly 32×8 px (.025L×.006L; 24×6 mm), with about 51 px (.039L; 39 mm) centre spacing. Lower-edge openings are only partial silhouettes near x≈810, 954 and 1004; do not extrapolate a symmetric hidden vent pattern (`slots`).
- The upper receiver has a long shallow roof and a sloping underside ahead of the magazine seat. The lower steps down at the grip and guard. The folded carry-handle grip overlaps the forward receiver; its wire return goes over the roof. The small circular feature at x≈550 is traced as `receiver-control-pin`, not asserted to be the charging handle. The supplied receiver close-up resolves the opposite, left side: a circular charging knob at the forward end of a long receiver-side slide. It is a fixed-stock companion reference, not proof of the Para's stock or rear-sight variant. Use it for the charging-handle contour, magazine ribs and receiver detailing, not as an independently calibrated dimension reference. The original side photograph shows the ejection-port/carry-handle side; do not confuse its small circular control with the charging knob.
- The magazine is nearly straight, not AK-curved: rear edge x≈599→603 over y=157→294 (about 2° from vertical), forward edge x≈705→706 (less than 1°). The sloping base rises toward the muzzle by about 11°. Perspective and unequal insertion depth explain some apparent wedge; the photo does not establish a curved centreline. Face ribs are traced separately (`mag-ribs`); the hidden top is not reconstructed. The apparent 20-round identity is plausible, not a measured capacity.
- The grip leans rearward. The neck-to-heel midline runs roughly (463,150)→(392,250): about 35° from vertical. Its heel slopes about 25° down toward the muzzle. This rake is a stronger silhouette cue than a generic vertical grip.
- The stock's upper tube is nearly horizontal: about 1.4° upward toward the hinge. The lower tube's straight rear run rises about 35° toward the front, then becomes a nearly horizontal forward run; the elbow is around x≈175–205. These are two struts surrounding a large triangular void, not a solid wedge. The buttplate leans about 6° from vertical (lower end forward); tube thicknesses are roughly 12–18 px (9–14 mm), distinct from their larger bounding envelopes. Hinge and the small vertical brace remain separate outlines.

## Comparison boundary

Compare the **loaded curated design**, not a fresh random battle-rifle: `../designs/archetype-battle-rifle.json`, `assembly`. Resolve its existing display solids without moving parts; the projection uses its native physical scale (`../src/gun/units.ts`, `GUN_UNITS`). Use the same mm/pixel in the comparison panel as the provisional photo calibration. A left-side projection can compare broad envelopes, but the original photo's ejection-port side and the companion close-up's charging-handle side must be distinguished when comparing controls. Register the receiver/barrel interface to photo x≈748 and use a separate bore datum in each panel. Do not stretch either panel to equal overall length: that would hide the stock/receiver proportion error. Photo perspective remains unrectified; the solid-colour projection is a geometry comparison, not a material render.

| Part | Match | Difference to resolve for the authored target |
| --- | --- | --- |
| Receiver/lower | Conventional magazine-ahead-of-grip layout | Generic rectangular envelope lacks the Para's long upper and stepped/sloping lower silhouette; its barrel interface is useful only as registration, not proof of fit. |
| Barrel/muzzle | Exposed cylindrical forward section | Existing barrel ends without this distinct muzzle-device outline; do not treat the photo device as extra barrel length. Hidden barrel length remains unresolved. |
| Handguard/gas system | Long barrel-mounted forend | The photo has a shallower slotted shell, distinct gas block and elevated front sight; a plain generic forend does not supply these cues. |
| Stock | Rear-mounted shoulder support | Solid straight stock versus tubular two-strut skeleton, elbow, hinge, brace and raked buttplate; this needs authored stock geometry, not only a length change. |
| Grip/guard | Separate grip and trigger enclosure | Photo grip is more strongly raked with a broad sloping heel; guard is rounded rather than the archetype's rectilinear outline. |
| Magazine | Straight box in the correct general location | Photo has a broad face, sloping base and ribs; generic box is narrower in side profile. Do not add a pronounced curve. |
| Sights | Receiver-top sight mounting exists | Archetype selects a fixed 4× prism optic, whereas the target needs photo irons plus an optional optic as a real fitted attachment, not a baked-in optic. |
| Handles/controls | Battle handle geometry exists in `../src/gun/parts.ts`, `CARRIER_HANDLE_STYLES` | A FAL-named carrier handle does not establish photo alignment, carry-handle geometry or independent folding. The photo's carry handle lies down against the receiver; the supplied left-side close-up supplies the charging-knob/slide contour. |
| Finish | Dark metal/furniture separation is possible | Wear, green tape and markings are reference appearance, not evidence for extra mechanical geometry. |

## Settled authoring scope

The target replaces the legacy battle rifle as an authored design. Its stock, handguard, receiver and iron sights are authored for this gun, not drawn from a shared Para family; reuse is a later choice when another design needs it. Model working stock folding, including hinge, clearance and export, rather than a decorative static folding-stock outline. Include handguard slots, magazine ribs, carry handle, charging handle and sling loop with their proper part ownership. Keep the photo iron sights and support an optional optic as a real fitted attachment. Use clean dark metal and polymer: incidental tape and wear are not the target finish.

## Detail references and remaining limits

- The original side photograph supplies handguard-slot placement, carry-handle outline, sling-loop silhouette and Para rear/front sight envelopes. The companion left-side receiver close-up supplies the circular charging knob, slide, magazine ribs and receiver steps; it does not replace the Para stock or specify its rear sight.
- The [FN operator's manual](https://www.forgottenweapons.com/wp-content/uploads/manuals/FN-FAL%20Manual.pdf), "HANDGUARD", "CARRYING HANDLE", "FRONT SLING SWIVEL", "FORESIGHT", "COCKING HANDLE" and "BACKSIGHT", distinguishes the relevant components. Its standard fixed-stock dimensions and rear-sight graduation do not establish Para dimensions or a particular Para rear-sight variant. Its cocking handle does not move when the rifle fires, so a carrier-owned reciprocating knob is not a faithful default.
- [DS Arms original FN Para stock](https://dsarms.com/product/original-fn-herstal-production-fn-fal-folding-para-buttstock-new-old-stock/) supplies an independent stock/connector reference. [Para stock discussion](https://www.falfiles.com/threads/how-to-fold-a-para-stock.289333/) describes right-side folding and distinguishes latch variants; it is owner evidence, not a dimensioned hinge specification. The photograph places the vertical hinge near x≈360, but cannot resolve its lateral offset, travel or swept clearance. Validate those in the authored assembly, not by assuming a flat side-view rotation.
- [DS Arms Para optic mount](https://dsarms.com/product/dsa-fal-sa58-extreme-duty-scope-mount-standard-length-para-acog-cut-model-includes-hardware-dsa-fal-sa58-extreme-duty-scope-mount-standard-length-para-acog-cut-model-includes-hardware/) provides a concrete optional-mount reference: a Para-compatible replacement top cover with receiver-top Picatinny rail and an ACOG seating provision. The smooth photo cover is not itself an exposed optic rail. This source establishes a plausible mount location, not a fitted in-game attachment or permission to reuse an AR mount without checking it.

The unresolved matters are reference precision and implementation fit, not requests to reopen the settled identity, fold scope, detail budget, sights or finish. Exact maker/variant, sourced receiver length/height, hinge lateral offset and final optic seating coordinates remain unknown.
