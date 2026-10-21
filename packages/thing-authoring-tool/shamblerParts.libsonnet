local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, grip) = {
  id: id,
  parts: [{ id: 'part', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'part', solid: grip.solid, fraction: grip.fraction, turn: [0, 0, 0], hold: grip.hold, roll: 0 },
};
local skin = 'body-skin-sickly';
local limbFinish(cloth, end) = { skin: skin, cloth: cloth, end: end, gore: 'body-gore', bone: 'body-bone' };
local arm(id) = part(id, 'limb', 2.5, {
  length: 0.65, upper: 0.30, upperWidth: 0.095, upperDepth: 0.095, lowerWidth: 0.075, lowerDepth: 0.075,
  sleeve: 0.18, endLength: 0.17, endWidth: 0.085, endDepth: 0.035, endReach: 0,
}, limbFinish('cloth-shirt-faded', skin), { solid: 'end', fraction: [0.5, 0.5, 0.5], hold: 'forward' });
local leg(id) = part(id, 'limb', 4, {
  length: 0.85, upper: 0.42, upperWidth: 0.14, upperDepth: 0.14, lowerWidth: 0.1, lowerDepth: 0.1,
  sleeve: 0.78, endLength: 0.08, endWidth: 0.1, endDepth: 0.26, endReach: 0.1,
}, limbFinish('cloth-pants-grey', 'rubber-black'), { solid: 'lower-cloth', fraction: [0.5, 0.2, 0.5], hold: 'forward' });
[
  part('shambler_torso', 'torso', 12, {
    height: 0.6, chestWidth: 0.4, chestDepth: 0.22, pelvisWidth: 0.34, pelvisDepth: 0.21, pelvisHeight: 0.2,
    neckWidth: 0.1, neckHeight: 0.06, tear: 0.1,
  }, { shirt: 'cloth-shirt-faded', pants: 'cloth-pants-grey', skin: skin, gore: 'body-gore', bone: 'body-bone' }, { solid: 'chest', fraction: [0.5, 0.5, 0.5], hold: 'upright' }),
  part('shambler_head', 'head', 5, {
    width: 0.17, height: 0.23, depth: 0.2, jawHeight: 0.07, hairCover: 0.06,
  }, { skin: skin, hair: 'body-hair', eye: 'body-eye', mouth: 'body-mouth', gore: 'body-gore', bone: 'body-bone' }, { solid: 'skull', fraction: [0.5, 0.5, 0.5], hold: 'upright' }),
  arm('shambler_left_arm'),
  arm('shambler_right_arm'),
  leg('shambler_left_leg'),
  leg('shambler_right_leg'),
]
