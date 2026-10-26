local appearance = import 'appearance.jsonnet';
local mmPerU = (import 'unitScale.jsonnet').metresPerUnit * 1000;
local wall = 0.125;
local axisY = 2.5;
local backupZ = 0;
local backupY = 4.75;
local backupOpening = 0.25;
local backupRim = 0.5;
local objectiveRadius = 1.75;
local objectiveOpening = 16 / mmPerU;
local body(id, profile, thickness=wall) = {
  id: id, kind: 'revolved', axis: 'x', origin: [0, axisY, 0],
  profile: profile + [[p[0], p[1] - thickness] for p in std.reverse(profile)] + [profile[0]],
  sides: appearance.opticBodySides, slot: 'metal',
};
local cylinder(id, axis, origin, span, radius, slot='metal', sides=null) = {
  id: id, kind: 'revolved', axis: axis, origin: origin,
  profile: [[span[0], 0], [span[0], radius], [span[1], radius], [span[1], 0]], slot: slot,
} + if sides == null then {} else { sides: sides };
local snap(value) = std.floor(value / 0.25 + 0.5) * 0.25;
local box(id, low, high) = {
  id: id, kind: 'box', slot: 'metal', box: {
    center: [(snap(low[i]) + snap(high[i])) / 2 for i in std.range(0, 2)],
    half: [(snap(high[i]) - snap(low[i])) / 2 for i in std.range(0, 2)],
  },
};
local outline(id, profile, halfWidth, centerZ=0) = {
  id: id, kind: 'extruded-polygon', axis: 'z', z: [centerZ - halfWidth, centerZ + halfWidth],
  profile: profile, slot: 'metal',
};
local clipped(solid, planes) = solid + { clip: planes, display: { bevel: false } };
local ringPoint(radius, i) =
  local angle = (i + 0.5) * 2 * std.pi / appearance.opticBodySides;
  local scale = radius / std.cos(std.pi / appearance.opticBodySides);
  [axisY + scale * std.cos(angle), scale * std.sin(angle)];
// The side reference has a raked mouth, not a vertical end on a symmetric cone.
// Separate convex wall cells retain the octagonal bore while the same plane trims every cell.
local hood = [
  clipped({
    id: 'objective-hood-' + i, kind: 'extruded-polygon', axis: 'x', z: [3.25, 6.625],
    profile: [ringPoint(objectiveRadius, i), ringPoint(objectiveRadius, i + 1),
              ringPoint(objectiveOpening, i + 1), ringPoint(objectiveOpening, i)],
    slot: 'metal',
  }, [{ normal: [1, -0.5, 0], offset: 4.5 }])
  for i in std.range(0, appearance.opticBodySides - 1)
];
local fin = [[-6.125, 3.5], [-4.875, 3.5], [-5.375, 5.25], [-5.875, 5.25]];
{
  source: 'https://www.trijicon.com/products/details/ta31f',
  reference: 'TA31F published envelope, objective aperture and eye relief; side-photo trace of raked hood, rear-rising casting, ocular collar, control cluster and rear fin',
  // Published dimensions are L/H/W; the taller neck exceeds the height to separate body and clamp.
  envelopeMm: [151.89, 58.42, 50.8],
  envelopeU: [13.25, 5.25, 4.5],
  opticalAxisY: axisY,
  // The continuous TA51 clamp spans a loading mouth; it is not replaced with another mount by host type.
  excludedHostFeeds: ['top'],
  ocularX: -6.625,
  ocularOpeningDiameterU: 2,
  eyeReliefU: 38.1 / mmPerU,
  // Preserves the mounting/eye-datum tolerance, not a manufacturer specification.
  eyeDatumToleranceU: 8,
  mount: {
    contactLengthU: 8, contactWidthU: 1.75, minimumSlots: 5,
    description: 'TA51 flattop mount, photo-estimated two thumbscrews',
    clearanceU: { forward: 0.75, rearward: 0.75, lateral: 0.5 },
  },
  // Photo-estimated contours preserve the optical axis and approved taller envelope, not the photo's raw aspect ratio.
  solids: [
    box('rear-ring-foot', [-2, 0, -0.875], [-1, 0.75, 0.875]),
    box('front-ring-foot', [5, 0, -0.875], [6, 0.75, 0.875]),
    box('mount-bridge', [-2, 0.75, -0.875], [6, 1.25, 0.875]),
    body('prism-housing', [[-2.5, 1.25], [-1, 1.25], [2.25, 1.375], [3.25, objectiveRadius]]),
    body('ocular-bell', [[-6.625, 1.125], [-6.375, 1.125], [-6.25, 1.25], [-6, 1.25],
                         [-5.875, 1.125], [-4, 1.125], [-3.875, 1.5], [-2.75, 1.5], [-2.5, 1.25]]),
    outline('rear-rising-cast-roof', [[-2.75, 3.5], [0.75, 3.5], [0.75, 3.75], [-2.75, 4.125]], 1.125),
    outline('housing-keel', [[-2, 1.25], [5.75, 1.25], [3.25, 1.5], [-1.5, 1.75]], 0.625),
    cylinder('ocular-lens', 'x', [0, axisY, 0], [-6.625, -6.375], 1, 'lens', appearance.opticBodySides),
    // Seated behind the shortest edge of the slanted lip, so the complete glass remains protected.
    cylinder('objective-lens', 'x', [0, axisY, 0], [4.5, 4.75], objectiveOpening, 'lens', appearance.opticBodySides),
    outline('objective-top-seam', [[3.25, 4.125], [6.625, 4.125], [6.625, 4.375], [3.25, 4.375]], 0.25, backupZ),
    outline('backup-front-post', [[5.75, 4.25], [6.5, 4.25], [6.5, backupY], [5.875, backupY]], 0.25, backupZ),
    // A shared bore-parallel datum keeps the centred post visible through the near-tip opening, above the controls.
    outline('backup-rear-fin-near', fin, (backupRim - backupOpening) / 2, backupZ - (backupRim + backupOpening) / 2),
    outline('backup-rear-fin-far', fin, (backupRim - backupOpening) / 2, backupZ + (backupRim + backupOpening) / 2),
    clipped(outline('backup-rear-fin-top', fin, backupOpening, backupZ), [{ normal: [0, -1, 0], offset: -(backupY + backupOpening) }]),
    clipped(outline('backup-rear-fin-bottom', fin, backupOpening, backupZ), [{ normal: [0, 1, 0], offset: backupY - backupOpening }]),
    {
      id: 'backup-rear-aperture', kind: 'revolved', axis: 'x', origin: [0, backupY, backupZ],
      profile: [[-6.125, backupOpening], [-6.125, backupRim], [-5.75, backupRim], [-5.75, backupOpening], [-6.125, backupOpening]],
      sides: appearance.opticBodySides, slot: 'metal',
    },
    cylinder('elevation-stem', 'y', [-1.125, 0, 0], [3.5, 4], 0.75),
    cylinder('elevation-cap', 'y', [-1.125, 0, 0], [4, 4.625], 0.875),
    cylinder('elevation-cap-rim-lower', 'y', [-1.125, 0, 0], [4.125, 4.25], 0.9375),
    cylinder('elevation-cap-rim-upper', 'y', [-1.125, 0, 0], [4.375, 4.5], 0.9375),
    cylinder('windage-stem', 'z', [-1.125, 2.25, 0], [-2.5, -1.125], 0.625),
    cylinder('windage-cap', 'z', [-1.125, 2.25, 0], [-2.75, -2.5], 0.625),
    box('mount-near-clamp', [-2, 0.25, -1.125], [6, 1, -0.875]),
    box('mount-far-clamp', [-2, 0.25, 0.875], [6, 1, 1.125]),
  ] + hood + std.flattenArrays([
    [
      cylinder('mount-cross-bolt-' + name, 'z', [x, 0.625, 0], [-1.5, 1.125], 0.1875),
      cylinder('mount-thumbscrew-' + name, 'z', [x, 0.625, 0], [-2.125, -1.125], 0.625),
      box('mount-drive-' + name + '-upper', [x - 0.375, 0.75, -2.25], [x + 0.375, 1, -2.125]),
      box('mount-drive-' + name + '-lower', [x - 0.375, 0.25, -2.25], [x + 0.375, 0.5, -2.125]),
    ]
    for row in [['front', 5], ['rear', -0.5]]
    for name in [row[0]]
    for x in [row[1]]
  ]),
}
