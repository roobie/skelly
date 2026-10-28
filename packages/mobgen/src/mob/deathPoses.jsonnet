local limbs = {
  'upperArm.L': [0, 0, -40], 'upperArm.R': [0, 0, 25],
  'forearm.L': [0, 0, -25], 'forearm.R': [0, 0, 40],
  'thigh.L': [0, 0, -12], 'thigh.R': [0, 0, 18],
  'shin.L': [0, 0, -15], 'shin.R': [0, 0, 30],
};
local feet = { 'foot.L': [-1, 0, 0], 'foot.R': [1, 0, 0] };
local pose(id, weights, pitch, rotations) = {
  id: id,
  weights: weights,
  postures: {
    upright: { pitch: pitch, roll: 0, rotations: rotations },
    prone: {
      pitch: -90, roll: 0,
      rotations: rotations + {
        head: [0, 90, 0],
        'upperArm.L': [180, 0, rotations['upperArm.L'][2]],
        'upperArm.R': [180, 0, rotations['upperArm.R'][2]],
      },
    },
  },
};
{
  duration: 1.15,
  supportFaces: { upright: feet, prone: feet + { head: [1, 0, 0] } },
  settleBones: ['spine', 'chest', 'neck', 'head', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R'],
  poses: [
    pose('backward', { forward: 1, backward: 3 }, 60, limbs),
    pose('forward', { forward: 3, backward: 1 }, -60, limbs + {
      head: [0, 90, 0],
      'upperArm.L': [0, 0, -100], 'forearm.L': [0, 0, -45],
      'thigh.R': [0, 0, 30], 'shin.R': [0, 0, -50],
    }),
    pose('sprawled', { forward: 2, backward: 2 }, 60, limbs + {
      'upperArm.R': [0, 0, 85], 'forearm.R': [0, 0, 65],
      'thigh.L': [0, 0, -60], 'shin.L': [0, 0, 65],
    }),
  ],
}
