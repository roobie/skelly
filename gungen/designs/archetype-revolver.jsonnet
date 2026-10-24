local part(item, params={}) = { item: item } + if std.length(params) == 0 then {} else { params: params };
local connect(from, to) = { from: from, to: to };
{
  format: 1,
  template: 'revolver',
  calibre: '357-magnum',
  assembly: {
    name: 'archetype-revolver',
    description: 'Curated K/L-frame revolver with an aligned six-chamber cylinder.',
    root: 'frame',
    parts: {
      frame: part('revolver_frame'),
      barrel: part('revolver_barrel'),
      cylinder: part('revolver_cylinder', { chamberIndex: '0' }),
      crane: part('revolver_crane'), ejector: part('revolver_ejector'),
      hammer: part('revolver_hammer'), trigger: part('revolver_trigger'),
      grip: part('revolver_grip'),
    },
    connections: [
      connect('frame.crane', 'crane.mount'),
      connect('crane.cylinder', 'cylinder.crane'),
      connect('cylinder.ejector', 'ejector.mount'),
      connect('barrel.ejector', 'ejector.barrel'),
      connect('frame.hammer', 'hammer.mount'),
      connect('frame.trigger', 'trigger.mount'),
      connect('frame.barrel', 'barrel.frame'),
      connect('frame.cylinder', 'cylinder.frame'),
      connect('barrel.cylinder', 'cylinder.barrel'),
      connect('frame.grip-frame', 'grip.frame-joint'),
    ],
  },
  locks: { params: {}, optionalParts: [] },
  status: 'published',
}
