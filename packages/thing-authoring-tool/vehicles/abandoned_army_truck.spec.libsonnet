// A 6x6 military cargo truck left to rust, about 6.8 t: flat tyres drop it 0.16 m and the bed cover has rotted to its hoops.
// Metres in the vehicle frame; the flattened tyres rest on y = 0.
{
  rear: -3.4, nose: 3.2, front: 3.42,
  frontAxle: 2.2, rearAxles: [-1.38, -2.55], hubY: 0.362, tyreR: 0.5, rimR: 0.3, wheelZ: 0.96,
  rail: [0.76, 1.02], railZ: 0.44,
  deck: [1.24, 1.31], bed: { rear: -3.36, front: 0.25, side: 1.19, wall: 1.79 },
  hoop: { count: 7, shoulder: 2.56, peak: 2.8, top: 0.8 },
  cab: { back: 0.35, door: [0.42, 1.42], front: 1.62, floor: 1.06, waist: 1.76, roof: 2.44, side: 1.02 },
  bonnet: { back: 1.62, front: 3.2, z: 0.56, low: 0.92, high: 1.76, nose: 1.62 },
  wing: { z: 1.14, top: 1.36, board: 0.82 },
  finish: {
    olive: 'paint-olive',
    fade: 'cloth-olive-drab',
    rust: 'scrap-rusted',
    rustRed: 'rust-red',
    dark: 'steel-spall-black',
    iron: 'iron-cast',
    frame: 'steel-parkerized',
    wood: 'bark',
    rot: 'cloth-charred',
    canvas: 'webbing-olive-dark',
    rag: 'cloth-olive-drab',
  },
  // Paint weathered by `t`: faded, then rust spreading through it, deepest above 0.84.
  coat(t)::
    if t > 0.84 then 'rustRed'
    else if t > 0.52 then 'rust'
    else if t > 0.44 then 'fade'
    else 'olive',
}
