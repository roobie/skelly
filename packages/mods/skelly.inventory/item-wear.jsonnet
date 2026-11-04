local classes = {
  metal: { color: '#8f5130', mix: 0.65 },
  cloth: { color: '#b0a998', mix: 0.65 },
  wood: { color: '#84847c', mix: 0.65 },
  polymer: { color: '#aaa89c', mix: 0.4 },
  glass: { color: '#b5b5ab', mix: 0.2 },
  paper: { color: '#a9986f', mix: 0.5 },
  organic: { color: '#756752', mix: 0.35 },
  wax: { color: '#998d72', mix: 0.3 },
  mineral: { color: '#8e8a80', mix: 0.25 },
  fuel: { color: '#ba8429', mix: 0 },
};
{
  itemWear: [{
    id: 'core',
    bands: [
      { from: 0, tints: classes },
      { from: 0.4, tints: { [c]: classes[c] + { mix: classes[c].mix * 0.5 } for c in std.objectFields(classes) } },
      { from: 0.8, tints: { [c]: classes[c] + { mix: 0 } for c in std.objectFields(classes) } },
    ],
  }],
}
