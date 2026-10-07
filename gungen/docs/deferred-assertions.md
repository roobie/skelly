---
read_if:
  - you tune attachment mass from published product comparisons
  - you decide when attachment mass figures can become pinned assertions
---

# Deferred assertions

Computed attachment masses are class estimates for BR to tune, not fixed product replicas. The red-dot estimate `optic-mini-reflex` is 0.080 kg against the Aimpoint Micro T-2 specification of 0.096 kg. The 4× prism estimate `optic-fixed-prism-4x` is 0.357 kg against the Trijicon ACOG TA31 specification of 0.298 kg. The 5.56 suppressor estimate `real-suppressor` is 0.498 kg against the SureFire SOCOM556-RC2 specification of 0.482 kg; `improvised-suppressor` is 1.222 kg. Other exported estimates are 0.046 kg for `optic-tube-dot`, 0.309 kg for `optic-holographic`, 0.162 kg for `optic-lpvo-1-6x`, 0.325 kg for `optic-high-mag-5-25x`, 0.338 kg for `optic-digital-thermal`, 0.026 kg for `rail-front-sight`, 0.015 kg for `tactical-flashlight-mount`, and 0.017 kg for `foregrip`.

Recompute with `attachmentMassKg` in `src/gun/attachmentMass.ts` and compare against the cited manufacturer specifications: [Aimpoint Micro T-2](https://www.aimpoint.com/products/aimpoint-micro-t-2/), [Trijicon TA31](https://www.trijicon.com/products/details/ta31rco-m4cp), and [SureFire SOCOM556-RC2](https://www.surefire.com/socom556-rc2/). The exported flashlight asset is a mount, not a complete weapon light, so a weapon-light comparison must wait for a flashlight body export. Before d118-3 consumes these estimates, BR reviews the density and fill assumptions; pin assertions only after that approval.
