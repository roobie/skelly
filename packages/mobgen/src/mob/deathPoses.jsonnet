local limbs = {
  'upperArm.L': [0, 0, -40], 'upperArm.R': [0, 0, 25],
  'forearm.L': [0, 0, -25], 'forearm.R': [0, 0, 40],
  'thigh.L': [0, 0, -12], 'thigh.R': [0, 0, 18],
  'shin.L': [0, 0, -15], 'shin.R': [0, 0, 30],
};
{
  duration: 1.15,
  supportFaces: { 'foot.L': [-1, 0, 0], 'foot.R': [1, 0, 0] },
  settleBones: ['spine', 'chest', 'neck', 'head', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R'],
  poses: [
    { id: 'backward', weights: { forward: 1, backward: 3 }, pitch: 60, roll: 0, rotations: limbs },
    { id: 'forward', weights: { forward: 3, backward: 1 }, pitch: -60, roll: 0, rotations: limbs + {
      head: [0, 90, 0],
      'upperArm.L': [0, 0, -100], 'forearm.L': [0, 0, -45],
      'thigh.R': [0, 0, 30], 'shin.R': [0, 0, -50],
    } },
    { id: 'sprawled', weights: { forward: 2, backward: 2 }, pitch: 60, roll: 0, rotations: limbs + {
      'upperArm.R': [0, 0, 85], 'forearm.R': [0, 0, 65],
      'thigh.L': [0, 0, -60], 'shin.L': [0, 0, 65],
    } },
  ],
}
