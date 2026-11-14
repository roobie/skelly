// A gun model's press check (`packages/engine/src/core/schema/models.ts`, `GunModelSchema`) from the assets' pose-tool
// key frames, so the pose page and the game time one check and move the same parts. The pose frames place the rifle
// against a standing doll and turn its head; seen from the eye the game keeps the line of sight, so each frame's turn
// off the hold and the off hand's target are authored here for the first-person view.
local check = import 'packages/skelly-assets/models/poses/press-check.libsonnet';

// Per pose frame, in its numbered order: the turn off the hold in degrees, the lift off it in metres (up, back toward
// the eye and across toward the off hand), the eyes' small turn that the view takes while the aim stays put, and what
// the off hand holds. Unsighted fire holds the receiver below the view, so the lift carries it up and across to the
// middle rather than back toward the eye, where the dominant arm would fill the view.
local firstPerson = {
  'press-1-fire': { turnDegrees: { pitch: 0, yaw: 0, roll: 0 }, offHand: 'grip' },
  'press-2-turned': {
    turnDegrees: { pitch: -3, yaw: 0, roll: 40 },
    liftMetres: { up: 0.08, back: 0, across: 0.16 },
    lookDegrees: { pitch: -5, yaw: -3 },
    offHand: 'grip',
  },
  'press-3-handle': {
    turnDegrees: { pitch: -4, yaw: 0, roll: 55 },
    liftMetres: { up: 0.12, back: 0, across: 0.24 },
    lookDegrees: { pitch: -8, yaw: -5 },
    offHand: 'handle',
  },
  'press-4-retracted': {
    turnDegrees: { pitch: -5, yaw: 0, roll: 60 },
    liftMetres: { up: 0.14, back: 0, across: 0.28 },
    lookDegrees: { pitch: -10, yaw: -6 },
    offHand: 'handle',
  },
  'press-5-inspect': {
    turnDegrees: { pitch: -5, yaw: 0, roll: 60 },
    liftMetres: { up: 0.14, back: 0, across: 0.28 },
    lookDegrees: { pitch: -10, yaw: -6 },
    offHand: 'handle',
  },
  'press-6-released': {
    turnDegrees: { pitch: -4, yaw: 0, roll: 55 },
    liftMetres: { up: 0.12, back: 0, across: 0.24 },
    lookDegrees: { pitch: -8, yaw: -5 },
    offHand: 'handle',
  },
  'press-7-cover': {
    turnDegrees: { pitch: -3, yaw: 0, roll: 40 },
    liftMetres: { up: 0.08, back: 0, across: 0.16 },
    lookDegrees: { pitch: -5, yaw: -3 },
    offHand: 'port',
  },
  'press-8-fire': { turnDegrees: { pitch: 0, yaw: 0, roll: 0 }, offHand: 'grip' },
};

// A press check draws the carrier only far enough to show brass. Until the asset pin takes skelly-assets PR #205, whose
// frames pull this far themselves, the pinned frames' full stroke is cut to it here.
local pull = 0.3;

local numbered(names) = std.sort(names, function(name) std.parseInt(std.split(name, '-')[1]));

// The pose tool names a moved part by its exported node; the game names it by its action part.
local partShares(action, moved) = {
  [id]: std.min(pull, moved[std.split(action.parts[id].node, ':')[0]])
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
