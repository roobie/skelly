local red = [0.95, 0.075, 0.035];
local black = [0.025, 0.025, 0.025];
local dot(radius, color=red, center=[0, 0]) = { kind: 'dot', center: center, radius: radius, color: color };
local line(a, b, width=0.009, color=black) = { kind: 'line', from: a, to: b, width: width, color: color };
local ring(radius, width=0.012) = { kind: 'ring', center: [0, 0], radius: radius, width: width, color: red };
local reticle(reference, source, primitives, focalPlane='second', referenceMagnification=1, aperture={ aspectRatio: 1, exponent: 2 }) = {
  aperture: aperture,
  reference: reference,
  source: source,
  reticle: { focalPlane: focalPlane, referenceMagnification: referenceMagnification, primitives: primitives },
};
local cross(outer, inner, width=0.009) = [
  line([-outer, 0], [-inner, 0], width), line([inner, 0], [outer, 0], width),
  line([0, inner], [0, outer], width), line([0, -inner], [0, -outer], width),
];
{
  'mini-reflex': reticle('Aimpoint ACRO P-2 single dot', 'https://aimpoint.us/acro-p-2-red-dot-reflex-sight-3-5-moa-200691/', [dot(0.026)], aperture={ aspectRatio: 1.2, exponent: 6 }),
  'tube-dot': reticle('Aimpoint Micro T-2 single dot', 'https://www.aimpoint.com/products/red-dot-sights/micro-t-2', [dot(0.019)]),
  holographic: reticle('EOTECH XPS2-0 ring and dot', 'https://www.eotechinc.com/eotech-hws-xps2', [ring(0.48), dot(0.014)] + [
    line([-0.59, 0], [-0.48, 0], 0.012, red), line([0.48, 0], [0.59, 0], 0.012, red),
    line([0, 0.48], [0, 0.59], 0.012, red), line([0, -0.59], [0, -0.48], 0.012, red),
  ], aperture={ aspectRatio: 3 / 2.75, exponent: 6 }),
  'fixed-prism-4x': reticle('Trijicon TA31F chevron with BDC ladder', 'https://www.trijicon.com/products/details/ta31f', [
    line([-0.12, -0.12], [0, 0], 0.018, red), line([0, 0], [0.12, -0.12], 0.018, red),
    line([0, -0.19], [0, -0.75]),
    line([-0.17, -0.3], [0.17, -0.3]), line([-0.14, -0.43], [0.14, -0.43]),
    line([-0.11, -0.56], [0.11, -0.56]), line([-0.08, -0.69], [0.08, -0.69]),
  ]),
  'lpvo-1-6x': reticle('Vortex Razor HD Gen II-E JM-1 BDC illuminated center dot', 'https://vortexoptics.com/razor-hd-gen-ii-e-1-6x24.html',
    cross(0.88, 0.08) + [dot(0.022)] + [line([-tick[0], -tick[1]], [tick[0], -tick[1]]) for tick in [[0.18, 0.24], [0.15, 0.38], [0.12, 0.52], [0.09, 0.66]]]),
  'hunting-3-9x': reticle('Vortex Crossfire II V-Plex duplex', 'https://vortexoptics.com/vortex-crossfire-ii-3-9x40-riflescope.html',
    cross(0.87, 0.42, 0.035) + [line([-0.42, 0], [0.42, 0], 0.006), line([0, -0.42], [0, 0.42], 0.006)]),
  'high-mag-5-25x': reticle('Nightforce ATACR F1 MIL-R graduated crosshair', 'https://www.nightforceoptics.com/technology/reticles/mil-r/',
    cross(0.9, 0.035, 0.006) + [dot(0.009, black)] +
    [line([x, -0.035], [x, 0.035], 0.006) for x in [-0.72, -0.54, -0.36, -0.18, 0.18, 0.36, 0.54, 0.72]] +
    [line([-0.035, y], [0.035, y], 0.006) for y in [-0.72, -0.54, -0.36, -0.18, 0.18, 0.36, 0.54, 0.72]], 'second', 25),
  'digital-thermal': reticle('Pulsar Thermion scalable electronic crosshair', 'https://pulsarnv.com/products/thermion-2-xq50-pro',
    cross(0.82, 0.075, 0.012) + [dot(0.021)] + [line([-0.065, y], [0.065, y], 0.012) for y in [-0.25, -0.45, -0.65]], 'first', 12),
}
