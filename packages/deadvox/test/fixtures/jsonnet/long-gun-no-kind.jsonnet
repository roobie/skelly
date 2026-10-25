// A long gun export with neither a grip part nor a stock part: no firing hold fits it, so compiling must fail.
local longGunHands = import 'packages/deadvox/src/content/base/long-gun-hands.libsonnet';

longGunHands(
  {
    id: 'long_gun_no_kind_fixture',
    parts: { receiver: {}, barrel: {} },
    grip: { at: [0, 0, 0] },
    anchors: { support: [0.2, 0, 0] },
  },
  -0.4,
  [-0.02, -0.02],
)
