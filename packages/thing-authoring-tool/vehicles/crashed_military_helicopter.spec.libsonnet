// A medium utility helicopter down on its belly, about 4.8 t: a 16 m wreck with its 8 m blades broken and its tail boom
// lying apart. Metres in the vehicle frame: the mast stands at x = 0 and the belly rests on y = 0.
{
  nose: 4.2, cockpitRear: 1.6, doorFront: 0.5, doorRear: -1.4, cabinRear: -2.8, tear: -3.3,
  deck: 0.3, mastFoot: 2.6, hub: 3.15, enginesY: 2.3, enginesZ: 0.46,
  boomRoot: { x: -4.5, z: 0.7, r: 0.42 }, boomTip: { x: -9.7, z: 2.9, r: 0.2 },
  shellMass: 2640, paint: 'paint-olive', scorch: 'plastic-scorched', soot: 'steel-spall-black',
  body: [
    { x: 4.2, top: 0.95, bottom: 0.4, half: 0.2, waist: 0.65 },
    { x: 3.95, top: 1.32, bottom: 0.14, half: 0.68, waist: 0.68 },
    { x: 3.3, top: 1.76, bottom: 0, half: 1.0, waist: 0.8 },
    { x: 2.4, top: 2.0, bottom: 0, half: 1.12, waist: 0.9 },
    { x: 1.4, top: 2.05, bottom: 0, half: 1.18, waist: 0.95 },
    { x: -2.0, top: 2.05, bottom: 0, half: 1.18, waist: 0.95 },
    { x: -2.8, top: 1.98, bottom: 0.18, half: 1.0, waist: 1.05 },
    { x: -3.8, top: 1.82, bottom: 0.72, half: 0.56, waist: 1.3 },
  ],
  doghouse: [
    { x: 1.2, top: 2.05, bottom: 1.9, half: 0.45 },
    { x: 0.8, top: 2.38, bottom: 1.9, half: 0.66 },
    { x: 0.2, top: 2.64, bottom: 1.9, half: 0.86 },
    { x: -1.6, top: 2.62, bottom: 1.9, half: 0.86 },
    { x: -2.5, top: 2.1, bottom: 1.85, half: 0.42 },
  ],
}
