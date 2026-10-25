// A stock-wrist long gun with made-up dimensions, so a test can read the authored hold rule back through the held
// frame without pinning any shipped gun's numbers.
local longGunHands = import 'packages/deadvox/src/content/base/long-gun-hands.libsonnet';

longGunHands(
  {
    id: 'long_gun_hold_fixture',
    parts: { receiver: {}, barrel: {}, handguard: {}, stock: {} },
    grip: { at: [-0.2, -0.05, 0] },
    anchors: { support: [0.15, -0.03, 0.0] },
  },
  -0.5,
)
