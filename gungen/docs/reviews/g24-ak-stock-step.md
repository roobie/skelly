# G24 phase 1: AK stock-top step

**Status:** pinned for BR visual review; not approved as a mating fit.

At the AK receiver rear face, the top is Y=2.5u. At the stock's named front/mating face, the dropped-stock comb top is Y=1.0u. The current receiver-to-stock top step is therefore **1.5u (17.25mm)**, with the receiver taller. `test/akStockAlignment.test.ts` measures both face meshes in world space, asserts receiver-top > stock-top, and pins the 1.5u step for the design, fixture, and generated stock-length samples.

The previous flush-fit assertion was removed because the g24 receiver outline moved the named rear/top mating plane and the old condition no longer described the visible geometry. The 1.5u step is now explicit rather than silently relaxed. Keep it until BR gives the phase-1 visual ruling; change it only if that review requests a different mating geometry.
