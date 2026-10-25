---
read_if:
  - you decide the FAL variant or modelling scope before changing its geometry
  - you interpret the FAL reference trace or its provisional scale
---

# FAL profile study

## Purpose and boundary

Trace before modelling so a plausible generic rifle does not become the shape reference for its own correction. This is a proposed appearance target, not manufacturing geometry, and does not authorize a design, mechanism or export change. No modelling choice below is settled. Folding charging-handle motion remains outside this study (#648).

The supplied photograph and photo overlays stay outside the repository, like the AK reference (`../PROJECT.md`, "Design and variants"). The visible-edge transcription is [`../references/fal-profile.svg`](../references/fal-profile.svg); its path IDs identify the measured regions. Coordinates are original-image pixels, origin top left, muzzle right. Open paths deliberately leave obscured boundaries unresolved. Do not infer depth, hidden interfaces or internal action dimensions from this side profile.

## Identification and calibration

High confidence: a metric-pattern FAL Para-family rifle, with extended tubular side-folding stock, box magazine, synthetic slotted handguard and combination-style muzzle device. Moderate-to-low confidence: a shortened-barrel Para, plausibly 50.62-class or a mixed-parts rifle. Exact maker, receiver subtype and barrel length cannot be established from this image. The carry handle argues against an unmodified Belgian 50.63; 50.61 and lightweight-lower 50.64 cannot be distinguished by material appearance alone. Green tape and wear are not variant evidence.

Source: [FN FAL variants and design details](https://en.wikipedia.org/wiki/FN_FAL). It lists a 533 mm barrel for 50.61/50.64, 457 mm for 50.62, and a carry-handle-less 440 mm 50.63; it also gives a 549 mm sight radius for 50.61/50.63. This is secondary-source evidence, not confirmation of the photographed gun's specification.

Use that **549 mm Para sight radius provisionally**, because the barrel breech and muzzle crown cannot be located reliably through the receiver and muzzle device. The sight-assembly centres are approximately x=395 and x=1116: 721 px, hence 0.7614 mm/px. These are silhouette proxies, not resolved aperture/post centres. Do not use the generic fixed-stock FAL overall length to calibrate this Para.

The visible overall span, buttplate x=27 to muzzle x=1333, is L=1306 px, provisionally about 994 mm. This is an output of the calibration, not an independent known dimension. Normalized proportions below remain useful if the absolute scale changes. Allow about ±5% for registration/perspective, and a separate unknown systematic error if this rifle has a different sight radius. Local contours are picked to approximately ±3–5 px, with larger uncertainty at overlaps. A verified variant dimension or a second orthographic reference is needed before treating mm estimates as authoring constraints.

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
- The upper receiver has a long shallow roof and a sloping underside ahead of the magazine seat. The lower steps down at the grip and guard. The folded carry-handle grip overlaps the forward receiver; its wire return goes over the roof. The small circular feature at x≈550 is traced as `receiver-control-pin`, not asserted to be the charging handle. A separate charging-handle outline is not confidently resolved in this photograph; left-side placement alone does not supply its shape or folded pose. Obtain a close-up before modelling that detail.
- The magazine is nearly straight, not AK-curved: rear edge x≈599→603 over y=157→294 (about 2° from vertical), forward edge x≈705→706 (less than 1°). The sloping base rises toward the muzzle by about 11°. Perspective and unequal insertion depth explain some apparent wedge; the photo does not establish a curved centreline. Face ribs are traced separately (`mag-ribs`); the hidden top is not reconstructed. The apparent 20-round identity is plausible, not a measured capacity.
- The grip leans rearward. The neck-to-heel midline runs roughly (463,150)→(392,250): about 35° from vertical. Its heel slopes about 25° down toward the muzzle. This rake is a stronger silhouette cue than a generic vertical grip.
- The stock's upper tube is nearly horizontal: about 1.4° upward toward the hinge. The lower tube's straight rear run rises about 35° toward the front, then becomes a nearly horizontal forward run; the elbow is around x≈175–205. These are two struts surrounding a large triangular void, not a solid wedge. The buttplate leans about 6° from vertical (lower end forward); tube thicknesses are roughly 12–18 px (9–14 mm), distinct from their larger bounding envelopes. Hinge and the small vertical brace remain separate outlines.

## Comparison boundary

Compare the **loaded curated design**, not a fresh random battle-rifle: `../designs/archetype-battle-rifle.json`, `assembly`. Resolve its existing display solids without moving parts; the projection uses its native physical scale (`../src/gun/units.ts`, `GUN_UNITS`). Put it in a second left-side orthographic panel with the same mm/pixel as the provisional photo calibration. Register the receiver/barrel interface to photo x≈748 and use a separate bore datum in each panel. Do not stretch either panel to equal overall length: that would hide the stock/receiver proportion error. Photo perspective remains unrectified; the solid-colour projection is a geometry comparison, not a material render.

| Part | Match | Difference to resolve if this photo is approved |
| --- | --- | --- |
| Receiver/lower | Conventional magazine-ahead-of-grip layout | Generic rectangular envelope lacks the Para's long upper and stepped/sloping lower silhouette; its barrel interface is useful only as registration, not proof of fit. |
| Barrel/muzzle | Exposed cylindrical forward section | Existing barrel ends without this distinct muzzle-device outline; do not treat the photo device as extra barrel length. Hidden barrel length remains unresolved. |
| Handguard/gas system | Long barrel-mounted forend | The photo has a shallower slotted shell, distinct gas block and elevated front sight; a plain generic forend does not supply these cues. |
| Stock | Rear-mounted shoulder support | Solid straight stock versus tubular two-strut skeleton, elbow, hinge, brace and raked buttplate; this is a family change, not only a length change. |
| Grip/guard | Separate grip and trigger enclosure | Photo grip is more strongly raked with a broad sloping heel; guard is rounded rather than the archetype's rectilinear outline. |
| Magazine | Straight box in the correct general location | Photo has a broad face, sloping base and ribs; generic box is narrower in side profile. Do not add a pronounced curve. |
| Sights | Receiver-top sight mounting exists | Archetype selects a fixed 4× prism optic, whereas this photo has Para irons; an optic would be an unrequested silhouette change. |
| Handles/controls | Battle handle geometry exists in `../src/gun/parts.ts`, `CARRIER_HANDLE_STYLES` | A FAL-named carrier handle does not establish photo alignment, carry-handle geometry or independent folding. The photo's carry handle lies down against the receiver; charging-handle contour needs another view. |
| Finish | Dark metal/furniture separation is possible | Wear, green tape and markings are reference appearance, not evidence for extra mechanical geometry. |

## Questions for BR before modelling

Debt grades use `../../GLOSSARY.md`, "Tech debt": implementation effort alone is not debt. These are choices, not recommendations or implied approvals.

| Decision | Options and debt | What remains open |
| --- | --- | --- |
| Design identity | **New curated Para design**, retaining the generic archetype: low debt if shared mechanisms stay shared. **Reshape/rename the archetype** as the sole Para target: low debt if its consumers and purpose are intentionally replaced; medium if generic assumptions survive under misleading names. | Which design should ship, and whether existing battle-rifle consumers are meant to change. |
| Variant and scale | **Approve the photographed silhouette as a stylized mixed/unknown Para**: low debt if uncertainty stays explicit. **Choose a named 50.61/62/63/64 and obtain a dimensioned reference**: low debt, more research. **Declare an exact variant from this image alone**: high debt because later references can force coupled re-proportioning. | Barrel length, exact receiver/lower identity, and whether the provisional sight calibration is acceptable. |
| Stock state | **Extended skeleton only, as photographed**, with no fold promise: low debt. **Static folded presentation as a separately authored state**: low debt if it is explicitly non-interactive, medium if later animation must replace incompatible geometry. **Working folding stock**: not inherently debt, but expands scope to hinge axis, receiver clearance and export/handling contract. | Whether folding is in scope at all; folded-side clearance is not visible here. No charging-handle fold work under #648. |
| Shape vocabulary | **Shared constrained Para part family/profile**: low debt. **Design-specific authored prefab within the vocabulary**: low debt if its ownership stays explicit. **Edit generic solids or add identity-based exceptions to force only this picture**: high debt from hidden coupling and repeated exceptions. | Which other designs should reuse the stock, handguard, receiver and iron sights. |
| Detail budget | **Silhouette cues only** (struts, rake, box magazine, gas/front sight, separate muzzle device): low debt if deliberately final. **Also slots/ribs, carry handle, resolved charging handle and sling loop**: low debt with suitable part ownership, but more work. **Temporary drawn-on details promised as later functional parts**: medium/high debt if they must be torn out. | Which features BR needs at the intended viewing distance, and the close-up needed for the charging handle. |
| Sights and attachments | **Photo irons, no optic**: low debt. **Irons with optional existing optic attachment**: low debt if fit is genuinely certified. **Bake the archetype's optic into the photo target**: medium debt if preserving it merely postpones correcting sight/attachment ownership. | Required sight picture, front/rear ownership and whether optic compatibility is requested. |
| Finish | **Clean dark metal/polymer** or **authored worn/taped appearance**: both low debt if complete intended finishes. **Geometry for tape/wear without an agreed final appearance**: medium debt through avoidable rework. | Whether the tape, paint wear and markings are part of the target or incidental to the reference. |

Approval needs an identity, reference/scale policy, stock-state scope and detail budget; no option has been selected here.
