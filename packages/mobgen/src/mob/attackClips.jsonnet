// Authored shared-rig attack clips (mob/attack.ts samples and layers them; templates select one by id
// through `attackClip`). Every key lists every bone the clip touches so its shape is obvious; the first
// and last key are all-zero for a clean blend in and out.
local bones = ['spine', 'chest', 'head', 'jaw', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R'];
local zeroKey(t) = { t: t, rotations: { [b]: [0, 0, 0] for b in bones } };
{
  // One-armed claw swipe: windup (torso coils away, the right arm lifts wide and curls), strike (torso
  // unwinds, the arm sweeps horizontally across the front at chest height, hitTime), recover.
  swipe: {
    name: 'swipe',
    duration: 0.85,
    hitTime: 0.42,
    keys: [
      zeroKey(0),
      {
        t: 0.28,
        rotations: {
          spine: [2, -6, 0],
          chest: [4, -8, 0],
          head: [0, 9, 0],
          jaw: [12, 0, 0],
          'upperArm.L': [18, 0, 0],
          'upperArm.R': [55, -100, 0],
          'forearm.L': [25, 0, 0],
          'forearm.R': [45, 0, 0],
        },
      },
      {
        t: 0.42,
        rotations: {
          spine: [-5, 7, 0],
          chest: [-7, 10, 0],
          head: [-3, -6, 0],
          jaw: [24, 0, 0],
          'upperArm.L': [8, 0, 0],
          'upperArm.R': [85, 15, 0],
          'forearm.L': [0, 0, 0],
          'forearm.R': [0, 0, 0],
        },
        pelvisDrop: 0.02,
      },
      {
        t: 0.6,
        rotations: {
          spine: [-2, 3, 0],
          chest: [-3, 5, 0],
          head: [-1, -3, 0],
          jaw: [10, 0, 0],
          'upperArm.L': [4, 0, 0],
          'upperArm.R': [70, 40, 0],
          'forearm.L': [0, 0, 0],
          'forearm.R': [12, 0, 0],
        },
      },
      zeroKey(0.85),
    ],
  },
}
