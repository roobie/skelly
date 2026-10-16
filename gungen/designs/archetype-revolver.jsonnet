local part(family, params={}) = { family: family } + if std.length(params) == 0 then {} else { params: params };
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
      frame: part('revolver-frame', { bore: 'M', frameSize: 'M', butt: 'round' }),
      barrel: part('revolver-barrel', { length: 'M', style: 'classic' }),
      cylinder: part('revolver-cylinder', { chamberCount: '6', chamberIndex: '0' }),
      crane: part('revolver-crane'), ejector: part('revolver-ejector'),
      hammer: part('revolver-hammer'), trigger: part('revolver-trigger'),
      grip: part('revolver-grip', { length: 'M' }),
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
