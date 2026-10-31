{
  // The pump's blade, shared by guns without a traced trigger. Points run from the finger space's rear and bottom;
  // the top edge's two x offsets meet whatever closes the opening's top.
  trigger: {
    lower: [[0.5, 0.25], [1.25, 0.75]],
    topX: [1.25, 1],
    halfWidthU: 0.25,
  },
  guards: {
    ak: {
      wallU: 0.25,
      clearanceU: 0.5,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      fingerY: [-4.5, -1.75],
      fingerZ: [-1, 1],
    },
    // The front wall's outer face stays where the closed guard's was, so it still meets the magazine housing's rear.
    'ar-small': {
      wallU: 0.25,
      clearanceU: 0.75,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      fingerY: [-4.5, -1.75],
      fingerZ: [-1, 1],
    },
    // Traced with the frame's lower (see arFrames.jsonnet), which owns the finger's x and y: a 0.25u guard wall with
    // the finger space's 0.5u clearance each side.
    'ar-large': {
      wallU: 0.25,
      clearanceU: 0.5,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      fingerZ: [-1, 1],
    },
    conventional: {
      wallU: 0.25,
      clearanceU: 0.75,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      fingerY: [-4.5, -1.75],
      fingerZ: [-1, 1],
    },
  },
}
