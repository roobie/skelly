// Vehicle parts in the vehicle frame: x forward, y up, z toward the near side.
local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local part(id, family, massKg, dimensions, finish, anchors) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: 'body', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  anchors: { [name]: { part: 'body', solid: anchors[name][0], fraction: anchors[name][1] } for name in std.objectFields(anchors) },
};
local tray(id, massKg, width, height, depth) = part(id, 'block', massKg, { width: width, height: height, depth: depth }, { body: 'steel-grey' }, {
  seat: ['body', [0.5, 1, 0.5]],
});
[
  part('car_battery', 'carton', 14, {
    width: 0.24, height: 0.17, depth: 0.175, lidHeight: 0.02, bandHeight: 0.06, bandInset: 0.0005,
    handleHeight: 0, handleWidth: 0.12, handleDepth: 0.04, handleWall: 0.006,
  }, { body: 'plastic-black', label: 'plastic-red', cap: 'plastic-black' }, {
    base: ['body', [0.5, 0, 0.5]],
    // Off the centre plane, so reflecting the battery moves its terminal to the other side.
    terminal_positive: ['lid', [0.8, 1, 0.2]],
  }),
  part('car_headlamp', 'block', 1.2, { width: 0.08, height: 0.16, depth: 0.22 }, { body: 'glass-grey' }, {
    mount: ['body', [0, 0.5, 0.15]],
    beam: ['body', [1, 0.5, 0.5]],
  }),
  tray('hatchback_battery_tray', 1.5, 0.28, 0.02, 0.21),
  tray('pickup_battery_tray', 2.2, 0.32, 0.03, 0.24),
]
