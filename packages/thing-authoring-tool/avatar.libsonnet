local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local shoulder(side) = { part: 'bust', solid: 'shoulder-' + side, fraction: [0.5, 0.5, 0.5] };
local hip(x) = { part: 'bust', solid: 'pelvis', fraction: [x, 0.12, 0.5] };
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
        pants: 'cloth-pants-player',
        shirt: 'cloth-shirt-player',
        skin: 'body-skin-player',
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
]
