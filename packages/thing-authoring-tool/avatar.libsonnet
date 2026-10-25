local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local shoulder(side) = { part: 'torso', solid: 'shoulder-' + side, fraction: [0.5, 0.5, 0.5] };
local hip(x) = { part: 'torso', solid: 'pelvis', fraction: [x, 0.12, 0.5] };
// The player's skin, shirt and trousers, shared by every body part so the joins match.
local skin = 'body-skin-player';
local shirt = 'cloth-shirt-player';
local pants = 'cloth-pants-player';
// The arm's measures; shoulder to fingertip reaches mid-thigh on the standing figure.
local arm = {
  upperLength: 0.3, upperWidth: 0.085, upperDepth: 0.09, sleeveLength: 0.15,
  foreLength: 0.25, foreWidth: 0.08, wristWidth: 0.06,
  palmLength: 0.1, palmWidth: 0.085, palmThickness: 0.032, fingerLength: 0.08, thumbLength: 0.06,
  sleeveThickness: 0.008, seamOverlap: 0.01, handOverlap: 0.005, armChamfer: 0.03, wristChamfer: 0.02,
  foreDepthExtra: 0.004, wristDepthExtra: 0.006, wristShare: 0.45,
  fingerThicknessShare: 0.8, thumbThicknessShare: 0.7, fingerFrontShare: 0.9, thumbRootShare: 0.3,
  thumbInset: 0.004, thumbProjection: 0.014,
};
// The leg's measures; `length` is hip joint to sole, so it matches the figure row's hip height and the shoe stands on
// the ground.
local leg = {
  length: 0.82, thighLength: 0.42, thighWidth: 0.15, thighDepth: 0.16,
  shinWidth: 0.11, shinDepth: 0.12,
  shoeHeight: 0.09, shoeWidth: 0.1, toeReach: 0.21, heelReach: 0.06,
  thighChamfer: 0.04, shinChamfer: 0.03, shoeChamfer: 0.04, kneeOverlap: 0.02, ankleOverlap: 0.01,
  cuffHeight: 0.04, cuffThickness: 0.006, soleThickness: 0.025, upperBase: 0.02,
  upperSideInset: 0.004, upperLengthInset: 0.008, upperBackShift: 0.004,
  toeCapSideInset: 0.006, toeCapTipInset: 0.002, toeCapHeightShare: 0.6, toeCapStartShare: 0.55,
};
// A limb joint: the socket on the segment above, at the joint, faces down; the pin at the segment's own origin faces
// up, so mated the lower segment hangs straight from the joint.
local jointSocket(id, pos) = { id: id, mount: 'assembly-joint', gender: 'female', pos: pos, normal: [0, -1, 0], up: [0, 0, 1], required: true };
local jointPin(id) = { id: id, mount: 'assembly-joint', gender: 'male', pos: [0, 0, 0], normal: [0, 1, 0], up: [0, 0, 1], required: true };
local armSegment(id, massKg, finish, ports) = {
  id: id,
  family: 'avatarArm',
  massKg: massKg,
  params: params(arm { segment: id }),
  finish: finish,
  ports: ports,
};
local legSegment(id, massKg, finish, ports) = {
  id: id,
  family: 'avatarLeg',
  massKg: massKg,
  params: params(leg { segment: id }),
  finish: finish,
  ports: ports,
};
local shoe = { shoe: 'leather-shoe-player', sole: 'rubber-black' };
// The bust's measures, hips to crown.
local bust = {
  pelvisWidth: 0.33, pelvisDepth: 0.2, pelvisHeight: 0.17,
  waistWidth: 0.3, waistDepth: 0.19, waistHeight: 0.17,
  ribWidth: 0.35, ribDepth: 0.21, ribHeight: 0.12,
  chestWidth: 0.4, chestDepth: 0.22, chestHeight: 0.15,
  shoulderWidth: 0.09, shoulderHeight: 0.12, shoulderDepth: 0.12,
  neckWidth: 0.1, neckHeight: 0.07, neckOverlap: 0.02,
  headWidth: 0.165, headHeight: 0.235, headDepth: 0.2, jawHeight: 0.08, hairCover: 0.07,
};
local bustSegment(id, massKg, finish, ports) = {
  id: id,
  family: 'bust',
  massKg: massKg,
  params: params(bust { segment: id }),
  finish: finish,
  ports: ports,
};
// The head stands on the neck: the socket on the torso faces up and the pin at the head's origin faces down.
local neckSocket(pos) = jointSocket('head', pos) { normal: [0, 1, 0] };
local neckPin = jointPin('head') { normal: [0, -1, 0] };
[
  {
    id: 'player_bust',
    exportMass: 'parts',
    // The head is its own part so a stance lifts it about the neck's top while the torso leans; the head mates to
    // the torso there, so the whole stands exactly as one piece would.
    parts: [
      bustSegment('torso', 33, { pants: pants, shirt: shirt, skin: skin }, [neckSocket(
        [0, bust.pelvisHeight + bust.waistHeight + bust.ribHeight + bust.chestHeight + bust.neckHeight + bust.neckOverlap, 0],
      )]),
      bustSegment('head', 5, { skin: skin, hair: 'body-hair', eye: 'body-eye', mouth: 'body-mouth' }, [neckPin]),
    ],
    connections: [{ from: 'torso.head', to: 'head.head' }],
    // The pivots code poses from: the neck where the torso meets the head, the head's own pivot above it, a
    // shoulder at each deltoid cap's centre and a hip under each side of the pelvis. Left is the figure's left, +x.
    anchors: {
      neck: { part: 'torso', solid: 'neck', fraction: [0.5, 0, 0.5] },
      head: { part: 'torso', solid: 'neck', fraction: [0.5, 1, 0.5] },
      shoulder_left: shoulder('left'),
      shoulder_right: shoulder('right'),
      hip_left: hip(0.75),
      hip_right: hip(0.25),
    },
  },
  {
    id: 'player_arm',
    exportMass: 'parts',
    // One segment per part so the first-person view bends the arm at its joints; each segment is drawn about its
    // own joint and mates to the segment above it there, so the whole hangs exactly as one piece would.
    parts: [
      armSegment('upper', 1.9, { shirt: shirt, skin: skin }, [jointSocket('elbow', [0, -arm.upperLength, 0])]),
      armSegment('fore', 1.1, { skin: skin }, [jointPin('elbow'), jointSocket('wrist', [0, -arm.foreLength, 0])]),
      armSegment('palm', 0.3, { skin: skin }, [
        jointPin('wrist'),
        jointSocket('knuckles', [0, -arm.palmLength, 0]),
        jointSocket('thumb', [0, -arm.palmLength * arm.thumbRootShare, arm.palmWidth / 2 - arm.thumbInset]),
      ]),
      armSegment('fingers', 0.15, { skin: skin }, [jointPin('knuckles')]),
      armSegment('thumb', 0.05, { skin: skin }, [jointPin('thumb')]),
    ],
    connections: [
      { from: 'upper.elbow', to: 'fore.elbow' },
      { from: 'fore.wrist', to: 'palm.wrist' },
      { from: 'palm.knuckles', to: 'fingers.knuckles' },
      { from: 'palm.thumb', to: 'thumb.thumb' },
    ],
    // The pivots code poses from: the shoulder the arm hangs from, sitting at the bust's shoulder anchor, each joint
    // below it, and the grip a held item sits at in the palm.
    anchors: {
      shoulder: { part: 'upper', solid: 'sleeve', fraction: [0.5, 1, 0.5] },
      elbow: { part: 'upper', solid: 'upper-arm', fraction: [0.5, 0, 0.5] },
      wrist: { part: 'fore', solid: 'wrist', fraction: [0.5, 0, 0.5] },
      knuckles: { part: 'palm', solid: 'palm', fraction: [0.5, 0, 0.5] },
      thumb_root: { part: 'thumb', solid: 'thumb', fraction: [0.5, 1, 0] },
      grip: { part: 'palm', solid: 'palm', fraction: [0.5, 0.5, 0.5] },
    },
  },
  {
    id: 'player_leg',
    exportMass: 'parts',
    // One segment per part so a stance bends the leg at the knee and ankle; each segment is drawn about its own joint
    // and mates to the segment above it there, so the whole stands exactly as one piece would.
    parts: [
      legSegment('thigh', 7, { pants: pants }, [jointSocket('knee', [0, -leg.thighLength, 0])]),
      legSegment('shin', 3, { pants: pants }, [
        jointPin('knee'),
        jointSocket('ankle', [0, leg.shoeHeight - leg.length + leg.thighLength, 0]),
      ]),
      legSegment('foot', 1, shoe, [jointPin('ankle')]),
    ],
    connections: [
      { from: 'thigh.knee', to: 'shin.knee' },
      { from: 'shin.ankle', to: 'foot.ankle' },
    ],
    // The pivots code poses from: the hip the leg hangs from and strides about, sitting at the bust's hip anchor, and
    // each joint below it. The ankle lies in the cuff, its overlap's height above the cuff's bottom.
    anchors: {
      hip: { part: 'thigh', solid: 'thigh', fraction: [0.5, 1, 0.5] },
      knee: { part: 'thigh', solid: 'thigh', fraction: [0.5, 0, 0.5] },
      ankle: { part: 'shin', solid: 'cuff', fraction: [0.5, leg.ankleOverlap / (leg.ankleOverlap + leg.cuffHeight), 0.5] },
    },
  },
]
