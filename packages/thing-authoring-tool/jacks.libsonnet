local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local tool(id, family, massKg, dimensions, finish) = {
  id: id,
  exportMass: 'parts',
  parts: [{ id: 'jack', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
};
[
  tool('scissor_jack', 'scissorJack', 3.2, {
    baseLength: 0.2, baseWidth: 0.09, baseThickness: 0.006,
    halfSpan: 0.095, halfHeight: 0.045, linkWidth: 0.02, linkDepth: 0.006, linkOffset: 0.03,
    screwRadius: 0.006, crankLength: 0.04, crankRadius: 0.008,
    saddleLength: 0.09, saddleWidth: 0.06, saddleThickness: 0.008,
  }, { frame: 'steel-parkerized', link: 'steel-grey', screw: 'paint-terracotta' }),
  tool('bottle_jack', 'bottleJack', 5.5, {
    baseLength: 0.15, baseWidth: 0.12, baseThickness: 0.012,
    bodyRadius: 0.05, bodyHeight: 0.12, shoulderRadius: 0.035, shoulderHeight: 0.02,
    ramRadius: 0.022, ramHeight: 0.07, saddleRadius: 0.03, saddleThickness: 0.01,
    socketRadius: 0.009, socketLength: 0.03,
  }, { frame: 'steel-parkerized', body: 'plastic-red', ram: 'steel-grey' }),
  tool('engine_hoist', 'engineHoist', 48, {
    legLength: 1.0, legSpread: 0.7, legWidth: 0.06, legHeight: 0.07,
    mastHeight: 1.3, mastWidth: 0.09, boomReach: 1.1, boomRise: 0.25, boomWidth: 0.07,
    ramWidth: 0.05, ramFoot: 0.25, ramJoin: 0.45,
    casterRadius: 0.05, casterWidth: 0.04,
    chainLength: 0.45, chainWidth: 0.012, hookWidth: 0.04, hookHeight: 0.06,
  }, { frame: 'paint-charcoal', boom: 'plastic-blue', ram: 'steel-grey', chain: 'steel-grey', caster: 'paint-charcoal' }),
]
