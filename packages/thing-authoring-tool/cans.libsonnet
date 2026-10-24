local params(values) = { [key]: std.toString(values[key]) for key in std.objectFields(values) };
local atom(id, family, massKg, dimensions, finish, solid, exportMass, turn=[0, 0, -90], roll=0) = {
  id: id,
  exportMass: exportMass,
  parts: [{ id: 'body', family: family, massKg: massKg, params: params(dimensions), finish: finish, ports: [] }],
  connections: [],
  handling: { part: 'body', solid: solid, fraction: [0.5, 0.5, 0.5], turn: turn, hold: 'upright', roll: roll },
};
{
  shellMassKg: 0.100,
  local tin(id, radius, height, label, serving, exportMass, food='paint-terracotta', massKg=self.shellMassKg) = atom(id, 'openTin', massKg, {
    radius: radius, height: height, wall: 0.0008, rimWidth: 0.0014,
    labelHeight: height * 0.68, labelThickness: 0.0003, stripeHeight: 0.003,
    hingeWidth: 0.012, hingeHeight: 0.004,
    serving: serving, foodDepth: height * 0.23, beanRadius: 0.006, beanCount: 6,
  }, { body: 'steel-grey', label: label, stripe: 'paperboard-tan', food: food }, 'wall', exportMass),
  items: [
    tin('opened_beans', 0.037, 0.11, 'paint-terracotta', 'beans', exportMass='inventory-atom'),
    tin('opened_soup', 0.034, 0.12, 'paperboard-tan', 'soup', exportMass='inventory-atom'),
    tin('empty_can', 0.037, 0.11, 'paint-terracotta', 'empty', exportMass='inventory-atom'),
    tin('opened_soda', 0.033, 0.115, 'plastic-red', 'drink', exportMass='inventory-atom', food='paint-oxblood', massKg=0.015),
    atom('can_opener', 'handOpener', 0.100, {
      handleLength: 0.127, tangWidth: 0.008, tangDepth: 0.006,
      gripLength: 0.092, gripWidth: 0.014, gripDepth: 0.014,
      handleGap: 0.008, handleSplay: 9,
      jawLength: 0.037, jawWidth: 0.021, jawThickness: 0.004, jawGap: 0.01,
      pivotRadius: 0.004,
      feedRadius: 0.009, feedThickness: 0.005, toothDepth: 0.002, toothCount: 12,
      cutterRadius: 0.008, cutterThickness: 0.002,
      spindleRadius: 0.003, spindleHeight: 0.022,
      keyLength: 0.042, keyWidth: 0.014, keyThickness: 0.006,
    }, { body: 'steel-grey', grip: 'plastic-red', wheel: 'steel-parkerized', key: 'paint-charcoal' }, 'grip-left', exportMass='parts', turn=[0, 0, 0], roll=90),
  ],
}
