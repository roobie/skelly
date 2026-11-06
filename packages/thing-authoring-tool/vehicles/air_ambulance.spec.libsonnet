// A medium twin-turbine on skids: a deep cabin with a large sliding door on each side and a pair of clamshell doors
// under a raised boom. About 13 m long over the rotor, 3.7 m tall, about 1800 kg empty. The mast stands at x = 0 and the
// skids rest on y = 0. Metres in the vehicle frame.
{
  nose: 2.7, noseCap: 2.62, doorFront: 1.75, doorMid: 0.72, doorRear: -0.95, tail: -2.0, roofArc: 32,
  floor: 0.875, floorRear: -1.85, floorFront: 1.2,
  rotorRadius: 5.5, hub: 3.55, mastFoot: 2.72,
  tailRotor: { x: -6.85, y: 2.2, z: 0.2, radius: 0.98 },
  boom: { root: { x: -1.7, y: 2.1, r: 0.3 }, tip: { x: -6.75, y: 2.2, r: 0.09 }, band: [-3.3, -3.8] },
  body: [
    { x: 2.7, top: 1.2, bottom: 0.95, half: 0.14, waist: 1.05 },
    { x: 2.62, top: 1.42, bottom: 0.8, half: 0.42, waist: 1.0 },
    { x: 2.35, top: 1.85, bottom: 0.62, half: 0.7, waist: 0.92 },
    { x: 1.85, top: 2.2, bottom: 0.52, half: 0.85, waist: 0.84 },
    { x: 1.2, top: 2.36, bottom: 0.5, half: 0.88, waist: 0.84 },
    { x: 0.0, top: 2.4, bottom: 0.5, half: 0.9, waist: 0.84 },
    { x: -1.0, top: 2.38, bottom: 0.52, half: 0.88, waist: 0.84 },
    { x: -1.6, top: 2.32, bottom: 0.58, half: 0.84, waist: 0.84 },
    { x: -2.0, top: 2.25, bottom: 0.66, half: 0.78, waist: 0.84 },
  ],
  clamshell: [
    { x: -2.0, top: 1.82, bottom: 0.68, half: 0.76, waist: 1.25 },
    { x: -2.25, top: 1.7, bottom: 0.82, half: 0.6, waist: 1.25 },
  ],
  cowl: [
    { x: -0.25, top: 2.5, bottom: 2.32, half: 0.3 },
    { x: -0.6, top: 2.9, bottom: 2.3, half: 0.62 },
    { x: -1.5, top: 2.92, bottom: 2.28, half: 0.62 },
    { x: -2.1, top: 2.54, bottom: 2.1, half: 0.36 },
  ],
  shellMass: 470, paint: 'paint-white', accent: 'paint-red',
}
