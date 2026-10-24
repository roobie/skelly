local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local shoulder(side) = { part: 'bust', solid: 'shoulder-' + side, fraction: [0.5, 0.5, 0.5] };
local hip(x) = { part: 'bust', solid: 'pelvis', fraction: [x, 0.12, 0.5] };
// The player's skin, shirt and trousers, shared by every body part so the joins match.
local skin = 'body-skin-player';
local shirt = 'cloth-shirt-player';
local pants = 'cloth-pants-player';
[
  {
    id: 'player_bust',
    exportMass: 'parts',
    parts: [{
      id: 'bust',
      family: 'bust',
      massKg: 38,
      params: params({
        pelvisWidth: 0.33, pelvisDepth: 0.2, pelvisHeight: 0.17,
        waistWidth: 0.3, waistDepth: 0.19, waistHeight: 0.17,
        ribWidth: 0.35, ribDepth: 0.21, ribHeight: 0.12,
        chestWidth: 0.4, chestDepth: 0.22, chestHeight: 0.15,
        shoulderWidth: 0.09, shoulderHeight: 0.12, shoulderDepth: 0.12,
        neckWidth: 0.1, neckHeight: 0.07,
        headWidth: 0.165, headHeight: 0.235, headDepth: 0.2, jawHeight: 0.08, hairCover: 0.07,
      }),
      finish: {
        pants: pants,
        shirt: shirt,
        skin: skin,
        hair: 'body-hair',
        eye: 'body-eye',
        mouth: 'body-mouth',
      },
      ports: [],
    }],
    connections: [],
    // The pivots code poses from: the neck where the torso meets the head, the head's own pivot above it, a
    // shoulder at each deltoid cap's centre and a hip under each side of the pelvis. Left is the figure's left, +x.
    anchors: {
      neck: { part: 'bust', solid: 'neck', fraction: [0.5, 0, 0.5] },
      head: { part: 'bust', solid: 'neck', fraction: [0.5, 1, 0.5] },
      shoulder_left: shoulder('left'),
      shoulder_right: shoulder('right'),
      hip_left: hip(0.75),
      hip_right: hip(0.25),
    },
  },
  {
    id: 'player_arm',
    exportMass: 'parts',
    parts: [{
      id: 'arm',
      family: 'avatarArm',
      massKg: 3.5,
      // Shoulder to fingertip reaches mid-thigh on the standing figure.
      params: params({
        upperLength: 0.3, upperWidth: 0.085, upperDepth: 0.09, sleeveLength: 0.15,
        foreLength: 0.25, foreWidth: 0.08, wristWidth: 0.06,
        palmLength: 0.1, palmWidth: 0.085, palmThickness: 0.032, fingerLength: 0.08, thumbLength: 0.06,
      }),
      finish: { shirt: shirt, skin: skin },
      ports: [],
    }],
    connections: [],
    // The joint the arm hangs from and turns about; it sits at the bust's shoulder anchor.
    anchors: { shoulder: { part: 'arm', solid: 'sleeve', fraction: [0.5, 1, 0.5] } },
  },
  {
    id: 'player_leg',
    exportMass: 'parts',
    parts: [{
      id: 'leg',
      family: 'avatarLeg',
      massKg: 11,
      // `length` is hip joint to sole, so it matches the figure row's hip height and the shoe stands on the ground.
      params: params({
        length: 0.82, thighLength: 0.42, thighWidth: 0.15, thighDepth: 0.16,
        shinWidth: 0.11, shinDepth: 0.12,
        shoeHeight: 0.09, shoeWidth: 0.1, toeReach: 0.21, heelReach: 0.06,
      }),
      finish: { pants: pants, shoe: 'leather-shoe-player', sole: 'rubber-black' },
      ports: [],
    }],
    connections: [],
    // The joint the leg hangs from and strides about; it sits at the bust's hip anchor.
    anchors: { hip: { part: 'leg', solid: 'thigh', fraction: [0.5, 1, 0.5] } },
  },
]
