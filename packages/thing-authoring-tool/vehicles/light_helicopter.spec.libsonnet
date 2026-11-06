// A two-seat piston trainer with a bubble canopy and skids: about 9 m long over the rotor, 2.8 m tall, about 420 kg
// empty. The mast stands at x = 0 and the skids rest on y = 0. Metres in the vehicle frame.
{
  nose: 2.1, bulkhead: 0.15, doorFront: 1.25, doorRear: 0.35, doorArc: 36,
  rotorRadius: 4.4, hub: 2.7, mastFoot: 1.85,
  tailRotor: { x: -4.25, y: 1.62, z: 0.14, radius: 0.55 },
  floor: 0.88,
  body: [
    { x: 2.1, top: 1.16, bottom: 0.84, half: 0.08, waist: 1.0 },
    { x: 2.0, top: 1.4, bottom: 0.66, half: 0.34, waist: 0.96 },
    { x: 1.75, top: 1.66, bottom: 0.54, half: 0.5, waist: 0.9 },
    { x: 1.35, top: 1.88, bottom: 0.47, half: 0.6, waist: 0.88 },
    { x: 0.85, top: 2.02, bottom: 0.45, half: 0.64, waist: 0.88 },
    { x: 0.35, top: 2.05, bottom: 0.45, half: 0.64, waist: 0.88 },
    { x: -0.2, top: 2.04, bottom: 0.5, half: 0.62, waist: 0.9 },
    { x: -0.9, top: 1.9, bottom: 0.72, half: 0.48, waist: 1.1 },
    { x: -1.5, top: 1.66, bottom: 1.02, half: 0.26, waist: 1.3 },
    { x: -1.95, top: 1.5, bottom: 1.24, half: 0.13, waist: 1.37 },
    { x: -2.05, top: 1.46, bottom: 1.27, half: 0.09, waist: 1.37 },
  ],
  shellMass: 114, paint: 'paint-red', boomPaint: 'paint-white',
}
