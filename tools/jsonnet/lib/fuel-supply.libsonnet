// A model's supply that shows a liquid's level by scaling the named fill piece along its height.
local bands = [{ from: 0, scale: 0 }, { from: 0.01, scale: 0.2 }, { from: 0.35, scale: 0.5 }, { from: 0.7, scale: 1 }];
function(piece) { kind: 'fill', piece: piece, axis: 'y', bands: bands }
