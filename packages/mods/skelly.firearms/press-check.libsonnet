// A gun model's press check (`packages/engine/src/core/schema/models.ts`, `GunModelSchema`) from the assets' pose-tool
// key frames, so the pose page and the game time one check and move the same parts. The pose frames place the rifle
// against a standing doll and turn its head; seen from the eye the game keeps the line of sight, so each frame's turn
// off the hold and the off hand's target are authored here for the first-person view.
local check = import 'packages/skelly-assets/models/poses/press-check.libsonnet';

// Per pose frame, in its numbered order: the turn off the hold in degrees and what the off hand holds.
local firstPerson = {
  'press-1-fire': { turnDegrees: { pitch: 0, yaw: 0, roll: 0 }, offHand: 'grip' },
  'press-2-turned': { turnDegrees: { pitch: 8, yaw: 12, roll: 50 }, offHand: 'grip' },
  'press-3-handle': { turnDegrees: { pitch: 8, yaw: 12, roll: 50 }, offHand: 'handle' },
  'press-4-retracted': { turnDegrees: { pitch: 8, yaw: 14, roll: 55 }, offHand: 'handle' },
  'press-5-inspect': { turnDegrees: { pitch: 10, yaw: 16, roll: 58 }, offHand: 'handle' },
  'press-6-released': { turnDegrees: { pitch: 8, yaw: 14, roll: 55 }, offHand: 'handle' },
  'press-7-cover': { turnDegrees: { pitch: 6, yaw: 10, roll: 45 }, offHand: 'port' },
  'press-8-fire': { turnDegrees: { pitch: 0, yaw: 0, roll: 0 }, offHand: 'grip' },
};

local numbered(names) = std.sort(names, function(name) std.parseInt(std.split(name, '-')[1]));

// The pose tool names a moved part by its exported node; the game names it by its action part.
local partShares(action, moved) = {
  [id]: moved[std.split(action.parts[id].node, ':')[0]]
  for id in std.objectFields(action.parts)
  if std.objectHas(moved, std.split(action.parts[id].node, ':')[0])
};

function(model)
  local names = numbered(std.objectFields(check.frames));
  assert check.rifle == model.id : 'the pose-tool press check is for %s, not %s' % [check.rifle, model.id];
  assert std.sort(names) == std.sort(std.objectFields(firstPerson)) : 'every pose frame needs its first-person view';
  model {
    gun+: {
      pressCheck: {
        easing: check.easing,
        keys: [
          local frame = check.frames[name];
          firstPerson[name]
          + (if std.objectHas(frame, 'into') then { intoSimSeconds: frame.into } else {})
          + (if std.objectHas(frame, 'hold') then { holdSimSeconds: frame.hold } else {})
          + (if std.objectHas(frame, 'moved') then { parts: partShares(model.gun.action, frame.moved) } else {})
          for name in names
        ],
      },
    },
  }
