// A wide-cabin single-turbine on skids, with a three-blade rotor and a searchlight under the near side: about 13 m long
// over the rotor, 3.4 m tall, about 1170 kg empty. The mast stands at x = 0 and the skids rest on y = 0. Metres in the vehicle frame.
{
  nose: 2.45, noseCap: 2.38, doorFront: 1.6, doorMid: 0.65, doorRear: -0.35, tail: -2.6, roofArc: 34,
  bandTop: 92, bandMid: 114, bandLow: 136, checkEnd: -1.15, check: 0.36,
  rotorRadius: 5.35, hub: 3.35, mastFoot: 2.5,
  tailRotor: { x: -6.15, y: 1.92, z: 0.18, radius: 0.93 },
  floor: 0.92,
  boom: { root: { x: -2.4, y: 1.72, r: 0.2 }, tip: { x: -6.05, y: 1.92, r: 0.08 }, band: [-3.1, -3.6] },
  body: [
    { x: 2.45, top: 1.12, bottom: 0.9, half: 0.12, waist: 1.0 },
    { x: 2.38, top: 1.34, bottom: 0.74, half: 0.38, waist: 0.98 },
    { x: 2.15, top: 1.72, bottom: 0.58, half: 0.66, waist: 0.95 },
    { x: 1.7, top: 2.1, bottom: 0.5, half: 0.8, waist: 0.92 },
    { x: 1.0, top: 2.3, bottom: 0.48, half: 0.84, waist: 0.92 },
    { x: 0.0, top: 2.32, bottom: 0.48, half: 0.84, waist: 0.92 },
    { x: -0.7, top: 2.28, bottom: 0.5, half: 0.8, waist: 0.92 },
    { x: -1.3, top: 2.2, bottom: 0.7, half: 0.62, waist: 1.25 },
    { x: -2.0, top: 1.98, bottom: 1.2, half: 0.34, waist: 1.6 },
    { x: -2.6, top: 1.92, bottom: 1.5, half: 0.2, waist: 1.7 },
  ],
  cowl: [
    { x: -0.2, top: 2.34, bottom: 2.14, half: 0.3 },
    { x: -0.55, top: 2.72, bottom: 2.12, half: 0.55 },
    { x: -1.5, top: 2.74, bottom: 2.0, half: 0.55 },
    { x: -2.3, top: 2.14, bottom: 1.8, half: 0.3 },
  ],
  shellMass: 400, paint: 'paint-police-blue', band: 'plastic-hivis',
}
