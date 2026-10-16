local blood = {
  sizeMetres: [0.3, 0.55], color: '#6c2019', agedColor: '#34251d',
  opacity: 0.88, agedOpacity: 0.72, ageingGameHours: 24 * 21,
  noiseScale: 8, edgeRaggedness: 0.45, strokes: [],
};
local scorch = {
  sizeMetres: [1.8, 1.3], color: '#211d1a', agedColor: '#39342e',
  opacity: 0.8, agedOpacity: 0.5, ageingGameHours: 24 * 365,
  noiseScale: 6, edgeRaggedness: 0.4, strokes: [],
};
local paint = {
  sizeMetres: [0.55, 0.55], color: '#b5ab70', agedColor: '#91896c',
  opacity: 0.9, agedOpacity: 0.65, ageingGameHours: 24 * 365,
  noiseScale: 9, edgeRaggedness: 0.2,
  strokes: [[0.1, 0.1, 0.9, 0.9, 0.07], [0.1, 0.9, 0.9, 0.1, 0.07]],
};
{
  blood(at, rotation=0): { kind: 'blood', at: at, normal: 'up', rotation: rotation,
    variants: [blood, blood + { sizeMetres: [0.24, 0.42], edgeRaggedness: 0.6 }] },
  scorch(at): { kind: 'scorch', at: at, normal: 'up', rotation: 0,
    variants: [scorch, scorch + { sizeMetres: [1.5, 1.7], noiseScale: 9 }] },
  searched(at): { kind: 'paint', at: at, normal: 'n', rotation: 0,
    variants: [paint, paint + { sizeMetres: [0.5, 0.6] }] },
}
