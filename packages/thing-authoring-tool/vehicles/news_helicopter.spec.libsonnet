// A five-seat light turbine on skids, with a camera ball under the nose: about 12 m long over the rotor, 3.2 m tall,
// about 750 kg empty. The mast stands at x = 0 and the skids rest on y = 0. Metres in the vehicle frame.
{
  nose: 2.35, noseCap: 2.27, doorFront: 1.5, doorMid: 0.55, doorRear: -0.4, tail: -2.3, roofArc: 32, bandArc: 118,
  rotorRadius: 5.1, hub: 3.1, mastFoot: 2.3,
  tailRotor: { x: -5.4, y: 1.76, z: 0.16, radius: 0.8 },
  floor: 0.98,
  body: [
    { x: 2.35, top: 1.22, bottom: 0.86, half: 0.1, waist: 1.02 },
    { x: 2.27, top: 1.42, bottom: 0.74, half: 0.32, waist: 1.0 },
    { x: 2.05, top: 1.72, bottom: 0.6, half: 0.54, waist: 0.98 },
    { x: 1.6, top: 2.04, bottom: 0.52, half: 0.66, waist: 0.98 },
    { x: 1.0, top: 2.15, bottom: 0.5, half: 0.7, waist: 0.98 },
    { x: 0.0, top: 2.16, bottom: 0.5, half: 0.7, waist: 0.98 },
    { x: -0.6, top: 2.12, bottom: 0.56, half: 0.66, waist: 1.02 },
    { x: -1.1, top: 2.06, bottom: 0.78, half: 0.52, waist: 1.3 },
    { x: -1.7, top: 1.92, bottom: 1.16, half: 0.3, waist: 1.52 },
    { x: -2.3, top: 1.8, bottom: 1.42, half: 0.16, waist: 1.6 },
  ],
  cowl: [
    { x: -0.15, top: 2.12, bottom: 1.98, half: 0.2 },
    { x: -0.38, top: 2.5, bottom: 1.98, half: 0.38 },
    { x: -1.3, top: 2.52, bottom: 1.9, half: 0.4 },
    { x: -1.9, top: 2.2, bottom: 1.72, half: 0.24 },
  ],
  shellMass: 215, paint: 'plastic-orange', band: 'paint-white',
}
