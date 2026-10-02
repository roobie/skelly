# Optic reference envelopes

Optics are static, stable-ID assembly attachments. These envelopes are visual reference classes, not promises of exact manufacturer CAD: no glass, reticle, zoom, night-vision, or thermal behavior is simulated. The assembly uses `1u ≈ 11.5mm` and rounds modeled dimensions to the existing `0.25u` grid. Catalog `envelopeMm` values preserve the cited reference dimensions; `envelopeU` and the solids are the grid-fitted visual envelope.

| Catalog ID | Reference class | Modeled overall envelope (L × H × W) | Source |
| --- | --- | --- | --- |
| `mini-reflex` | Trijicon RMR | 46 × 25 × 31 mm | [RMR RM06](https://www.trijicon.com/products/details/rm06-c-700672) |
| `tube-dot` | Aimpoint Micro T-2 | 68 × 41 × 41 mm | [Micro T-2](https://www.aimpoint.com/products/red-dot-sights/micro-t-2) |
| `holographic` | EOTECH EXPS3 class | 95 × 56 × 65 mm | [HWS EXPS3](https://www.eotechinc.com/eotech-hws-exps3) |
| `fixed-prism-4x` | Trijicon ACOG TA31 class, including mount | 150 × 45 × 60 mm | [TA31](https://www.trijicon.com/products/details/ta31-d-100549) |
| `lpvo-1-6x` | Vortex Razor HD Gen II-E 1–6×24 class | 257 × 80 × 65 mm | [Razor HD Gen II-E](https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html) |
| `high-mag-5-25x` | Nightforce ATACR 5–25×56 F1 class | 363 × 86 × 75 mm | [ATACR 5–25×56 F1](https://www.nightforceoptics.com/riflescopes/atacr/atacr-5-25x56-f1/) |
| `digital-thermal` | Pulsar Thermion 2 XQ50 Pro class | 343 × 80 × 80 mm | [Thermion 2 XQ50 Pro](https://pulsarnv.com/products/thermion-2-xq50-pro) |

The EXPS-class housing is proportioned to roughly 9.5 × 5.6 × 6.5 cm; the TA31-class prism with its foot is roughly 15 × 4.5 × 6 cm. The mini-reflex intentionally has only a small base and the front window/prism silhouette. Tubular bodies, bells, and scope turrets use octagonal extrusions rather than rectangular blocks.

Rifle optics attach to the receiver's physical top rail. The receiver rail is represented by actual solids as well as a generic slotted-rail port; tests transform each optic foot into receiver coordinates and verify its contact samples lie on a top face. The pistol is the deliberate exception: its attachment is on the slide rail. On top-loaded bolt receivers, static collision validation permits receiver-mounted optics to overlap the loading-port keep-out so scopes can remain on the receiver rail; this is a modeling compromise, not a claim that a mounted optic leaves the opening unobstructed. Other parts still must clear that volume.
