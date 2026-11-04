local fuelBands = [{ from: 0, scale: 0 }, { from: 0.01, scale: 0.2 }, { from: 0.35, scale: 0.5 }, { from: 0.7, scale: 1 }];
local fill(piece) = { kind: 'fill', piece: piece, axis: 'y', bands: fuelBands };
(import 'tools/jsonnet/lib/item-presentation.libsonnet')(
  import 'presentation/item-materials.json',
  overrides={
    broken_clock: ['polymer', 'metal', 'paper', 'glass'],
    broken_toaster: ['metal', 'polymer', 'metal'],
    circuit_board: ['polymer', 'metal', 'polymer', 'metal'],
    cracked_phone: ['polymer', 'glass', 'metal'],
    electrical_repair_kit: ['polymer', 'metal', 'polymer', 'metal'],
    glass_bulb: ['glass', 'metal', 'metal'],
    glass_lens: ['glass', 'glass'],
    lamp_oil_bottle: ['glass', 'metal', 'paper', 'fuel'],
    table_fan: ['metal', 'polymer', 'metal'],
    folded_note: ['paper', 'paper'],
    glowstick: ['polymer', 'polymer'],
    baseball_cap: ['cloth', 'polymer'],
  },
  supplies={
    lamp_oil_bottle: fill('fuel-fill'),
    lighter: fill('fuel_fill:fuel_fill'),
    oil_lamp: fill('fuel_fill:fuel_fill'),
  },
)
