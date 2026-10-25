local appearance = import 'appearance.jsonnet';
local mmPerU = 11.5;
local wall = 0.125;
local mountRise = 0.25;
local axisY = 2.25 + mountRise;
local objectiveRadius = 1.75;
local neckRadius = 1.125;
local flareEndX = 5.5;
local backupZ = 0.5;
local body(id, profile, thickness=wall) = {
  id: id, kind: 'revolved', axis: 'x', origin: [0, axisY, 0],
  profile: profile + [[p[0], p[1] - thickness] for p in std.reverse(profile)] + [profile[0]],
  sides: appearance.opticBodySides, slot: 'metal',
};
local cylinder(id, axis, origin, span, radius, slot='metal', sides=null, rise=0) = {
  id: id, kind: 'revolved', axis: axis, origin: [origin[0], origin[1] + rise, origin[2]],
  profile: [[span[0], 0], [span[0], radius], [span[1], radius], [span[1], 0]], slot: slot,
} + if sides == null then {} else { sides: sides };
local snap(value) = std.floor(value / 0.25 + 0.5) * 0.25;
local box(id, low, high, rise=0) = {
  id: id, kind: 'box', slot: 'metal', box: {
    center: [(snap(low[i]) + snap(high[i])) / 2 + (if i == 1 then rise else 0) for i in std.range(0, 2)],
    half: [(snap(high[i]) - snap(low[i])) / 2 for i in std.range(0, 2)],
  },
};
local outline(id, profile, halfWidth, centerZ=0, rise=0) = {
  id: id, kind: 'extruded-polygon', axis: 'z', z: [centerZ - halfWidth, centerZ + halfWidth],
  profile: [[p[0], p[1] + rise] for p in profile], slot: 'metal',
};
{
  source: 'https://www.trijicon.com/products/details/ta31f',
  reference: 'TA31F published envelope, objective aperture and eye relief; housing, turrets and TA51 contours are perspective-photo estimates, including backup irons',
  // Published dimensions are L/H/W; the taller neck intentionally exceeds the height to separate body and clamp.
  envelopeMm: [151.89, 58.42, 50.8],
  envelopeU: [13.25, 5 + mountRise, 4.5],
  opticalAxisY: axisY,
  // The continuous TA51 clamp spans a loading mouth; it is not replaced with another mount by host type.
  excludedHostFeeds: ['top'],
  ocularX: -6.625,
  ocularOpeningDiameterU: 2,
  eyeReliefU: 38.1 / mmPerU,
  // Preserves the existing mounting/eye-datum tolerance, not a manufacturer specification.
  eyeDatumToleranceU: 8,
  mount: {
    contactLengthU: 8, contactWidthU: 1.75, minimumSlots: 5,
    description: 'TA51 flattop mount, photo-estimated two thumbscrews',
    clearanceU: { forward: 0.75, rearward: 0.75, lateral: 0.5 },
  },
  // Coordinates in U: photo estimates registered on the optical axis and scaled by published length.
  // Feet carry the rail contact span; this mount is the same on every host.
  solids: [
    box('rear-ring-foot', [-2, 0, -0.875], [-1, 0.75, 0.875]),
    box('front-ring-foot', [5, 0, -0.875], [6, 0.75, 0.875]),
    box('mount-bridge', [-2, 0.75, -0.875], [6, 1 + mountRise, 0.875]),
    body('prism-housing', [[-4.5, 1.375], [-3.25, 1.5], [-1.5, 1.375], [2.75, neckRadius], [3.5, neckRadius]]),
    body('ocular-bell', [[-6.625, 1.125], [-5.875, 1.125], [-5.625, 1.375], [-5.25, 1.375], [-4.75, 1.25], [-4.5, 1.375]]),
    body('objective-bell', [[2.75, neckRadius], [3.5, neckRadius], [flareEndX, objectiveRadius], [6.625, objectiveRadius]], objectiveRadius - 16 / mmPerU),
    cylinder('ocular-lens', 'x', [0, axisY, 0], [-6.625, -6.375], 1, 'lens', appearance.opticBodySides),
    // The objective glass is recessed behind the protective lip, not painted across its mouth.
    cylinder('objective-lens', 'x', [0, axisY, 0], [flareEndX, flareEndX + 0.25], 16 / mmPerU, 'lens', appearance.opticBodySides),
    // The cast lower keel follows the body instead of a full-width rectangular prism.
    outline('housing-keel', [[-2, 1], [5.75, 1], [2.75, 2], [-1.5, 1.75]], 0.625, rise=mountRise),
    // Separate top seam: no red-dot platform is built into the housing.
    outline('backup-front-base', [[5.5, 3.625], [6.625, 3.625], [6.625, 4.125], [5.5, 4.125]], 0.375, backupZ, rise=mountRise),
    box('backup-front-post', [6.25, 4, backupZ - 0.25], [6.5, 4.5, backupZ + 0.25], rise=mountRise),
    outline('backup-rear-base', [[-6.5, 3.125], [-4.75, 3.125], [-5.375, 4.125], [-6.125, 4.125]], 0.375, backupZ, rise=mountRise),
    // Enlarged from the photo estimate so the aperture remains open at the optic detail grain.
    {
      id: 'backup-rear-aperture', kind: 'revolved', axis: 'x', origin: [0, 4.5 + mountRise, backupZ],
      profile: [[-6, 0.25], [-6, 0.5], [-5.5, 0.5], [-5.5, 0.25], [-6, 0.25]],
      sides: appearance.opticBodySides, slot: 'metal',
    },
    cylinder('elevation-stem', 'y', [-0.5, 0, 0], [3.25, 3.75], 0.75, rise=mountRise),
    cylinder('elevation-cap', 'y', [-0.5, 0, 0], [3.75, 4.375], 0.875, rise=mountRise),
    cylinder('elevation-cap-rim-lower', 'y', [-0.5, 0, 0], [3.875, 4], 0.9375, rise=mountRise),
    cylinder('elevation-cap-rim-upper', 'y', [-0.5, 0, 0], [4.125, 4.25], 0.9375, rise=mountRise),
    cylinder('windage-stem', 'z', [0.875, 2.4375, 0], [-2.5, -1.25], 0.5, rise=mountRise),
    cylinder('windage-cap', 'z', [0.875, 2.4375, 0], [-2.75, -2.5], 0.5, rise=mountRise),
    outline('objective-rib-ramp', [[3.5, 3.25], [flareEndX, 3.875], [flareEndX, 4.125], [3.5, 3.5]], 0.25, rise=mountRise),
    box('objective-rib', [flareEndX, 3.875, -0.25], [6.25, 4.125, 0.25], rise=mountRise),
    box('mount-near-clamp', [-2, 0.25, -1.125], [6, 1, -0.875]),
    box('mount-far-clamp', [-2, 0.25, 0.875], [6, 1, 1.125]),
  ] + std.flattenArrays([
    [
      cylinder('mount-cross-bolt-' + name, 'z', [x, 0.625, 0], [-1.5, 1.125], 0.1875),
      cylinder('mount-thumbscrew-' + name, 'z', [x, 0.625, 0], [-2.125, -1.125], 0.625),
      // A raised slotted drive is more legible than a solid round button at the item grain.
      box('mount-drive-' + name + '-upper', [x - 0.375, 0.75, -2.25], [x + 0.375, 1, -2.125]),
      box('mount-drive-' + name + '-lower', [x - 0.375, 0.25, -2.25], [x + 0.375, 0.5, -2.125]),
    ]
    for row in [['front', 5], ['rear', -0.5]]
    for name in [row[0]]
    for x in [row[1]]
  ]),
}
