// A large tandem-rotor cargo helicopter on four-point gear: about 30 m over the rotors, 6 m to the rear head, about
// 11 t empty. x = 0 lies midway between the masts; the tyres rest on y = 0. Metres in the vehicle frame.
{
  nose: 8.0, tail: -8.0,
  frontHub: { x: 6.0, y: 5.2 }, rearHub: { x: -6.0, y: 5.9 }, rotorRadius: 9.1,
  frontMastFoot: 4.62, rearMastFoot: 5.3,
  floorTop: 1.125, floorBase: 1.0, floorHalf: 1.65, floorRear: -6.0, floorFront: 5.0,
  bulkhead: 5.0,
  windscreen: [6.45, 7.7], screenArc: 76,
  door: [4.9, 5.85], doorArc: 56, doorPane: [58, 74], doorPaneX: [5.05, 5.7],
  rampTip: -8.45,
  frontGear: { x: 4.6, radius: 0.46875, width: 0.3, z: 2.08, top: 0.72, root: 1.35 },
  rearGear: { x: -4.5, radius: 0.46875, width: 0.3, z: 2.08, top: 0.72, root: 1.35 },
  sponson: { front: 3.6, rear: -3.6, taper: 1.0, inner: 1.78, outer: 2.35, low: 0.62, high: 1.72 },
  engine: { x: -6.45, y: 4.08, z: 1.22, length: 2.2, radius: 0.36 },
  cargo: { at: [-0.5, 0], cells: [100, 18, 26] },
  body: [
    { x: 8.0, top: 1.9, bottom: 0.85, half: 0.3, waist: 1.0 },
    { x: 7.8, top: 2.4, bottom: 0.7, half: 1.0, waist: 1.0 },
    { x: 7.3, top: 3.0, bottom: 0.6, half: 1.42, waist: 1.0 },
    { x: 6.5, top: 3.6, bottom: 0.55, half: 1.72, waist: 1.0 },
    { x: 5.5, top: 3.85, bottom: 0.55, half: 1.85, waist: 1.0 },
    { x: -6.0, top: 3.85, bottom: 0.55, half: 1.85, waist: 1.0 },
    { x: -8.0, top: 3.78, bottom: 2.2, half: 1.65, waist: 2.5 },
  ],
  shellMass: 1500, paint: 'paint-olive', trim: 'paint-charcoal',
}
