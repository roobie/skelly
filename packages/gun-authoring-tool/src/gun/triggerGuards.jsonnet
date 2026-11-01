{
  // The pump's blade, shared by guns without a traced trigger. Points run from the finger space's rear and bottom;
  // the top edge's two x offsets meet whatever closes the opening's top.
  trigger: {
    lower: [[0.5, 0.25], [1.25, 0.75]],
    topX: [1.25, 1],
    halfWidthU: 0.25,
  },
  // Curved blades, keyed by lower layout: convex side profiles that together trace the blade, each point offset from
  // the finger space's rear and top, so the blade hangs from whatever closes the opening's top.
  blades: {
    // Shaped like the large AR's traced blade and fitted to the pump's shorter finger space, which has no traceable
    // reference: a crescent that bows back from the top and curves forward to a thin tip a quarter unit above the
    // guard's floor, so its concave front is the finger face and the finger keeps the space in front of it.
    pump: {
      segments: [
        [[0.5, -0.375], [1, -0.375], [1.25, 0], [0.75, 0]],
        [[0.5, -0.75], [0.875, -0.75], [1, -0.375], [0.5, -0.375]],
        [[0.875, -1.25], [1.125, -1.25], [0.875, -0.75], [0.5, -0.75]],
      ],
      halfWidthU: 0.25,
    },
  },
  // Closed guards, keyed by lower layout.
  closed: {
    // BR's sketch over the stock-grip pump's guard, read at the trigger plate's scale: a near-vertical rear wall
    // from the plate, its inner face about 0.85u behind the finger space and its outer face 0.75u further back; a
    // flat bottom; and a long front ramp leaning forward up to the plate's front end. The sketched ramp, about 33
    // degrees, would cut the finger space's front corner; a ramp whose foot clears it reaches the receiver's
    // loading port unless it stands at least 47 degrees, so it takes 48. The opening keeps the rear's clearance
    // at the ramp's foot, as the closed guard requires.
    pump: {
      wallU: 0.25,
      rearWallU: 0.75,
      clearanceU: 0.75,
      frontRampDegrees: 48,
      halfWidthU: 0.625,
    },
  },
  // Guards whose corner meets the grip. `rear` follows each gun's reference: `open` leaves the opening's rear
  // above the corner empty, `lower` has the lower's body fill it.
  guards: {
    // Open behind the trigger, as the AK(M) looks.
    ak: {
      wallU: 0.25,
      clearanceU: 0.5,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      rear: 'open',
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
      rear: 'open',
      fingerY: [-4.5, -1.75],
      fingerZ: [-1, 1],
    },
    // Traced with the frame's grip from BR's photo (see arFrames.jsonnet, whose lower owns the finger's x and y). The
    // bar bows below the opening, about 0.5u deep at its middle; its underside rises about 20 degrees into the
    // magwell and steeply up the short corner to the grip's straight front. The magwell's rear is the thin front
    // wall. The opening keeps a 0.5u clearance each side. The lower's body closes the opening's rear in front of the
    // grip, as in the photo.
    'ar-large': {
      wallU: 0.5,
      frontWallU: 0.25,
      clearanceU: 0.5,
      halfWidthU: 0.625,
      frontCutU: 0.375,
      frontCutDegrees: 20,
      rearSlantDegrees: 35,
      rear: 'lower',
      fingerZ: [-1, 1],
    },
    conventional: {
      wallU: 0.25,
      clearanceU: 0.75,
      halfWidthU: 0.625,
      frontCutU: 0.125,
      frontCutDegrees: 45,
      rearSlantDegrees: 4,
      rear: 'open',
      fingerY: [-4.5, -1.75],
      fingerZ: [-1, 1],
    },
  },
}
