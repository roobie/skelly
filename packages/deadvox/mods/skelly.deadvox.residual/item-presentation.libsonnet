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
    riot_helmet_view: ['glass', 'polymer'],
    sewing_kit: ['polymer', 'cloth', 'metal', 'polymer'],
    stab_vest: ['cloth', 'cloth'],
    table_fan: ['metal', 'polymer', 'metal'],
    folded_note: ['paper', 'paper'], paper_sheet: ['paper', 'paper'], notebook: ['paper', 'paper'],
    glowstick: ['polymer', 'polymer'],
    apple: ['organic', 'wood', 'organic'], beans: ['organic', 'organic'], soup: ['organic', 'organic'],
    baseball_cap: ['cloth', 'polymer'], hoodie: ['cloth', 'polymer'],
    jacket: ['cloth', 'polymer'], jeans: ['cloth'], rubber_boots: ['polymer', 'polymer'],
    school_backpack: ['cloth', 'polymer'], school_backpack_worn: ['cloth', 'polymer', 'polymer'], school_backpack_worn_jacket: ['cloth', 'polymer', 'polymer'],
    fanny_pack: ['cloth', 'polymer'], fanny_pack_worn: ['cloth', 'polymer'], fanny_pack_worn_jacket: ['cloth', 'polymer'],
    utility_vest: ['cloth', 'polymer'], utility_vest_worn: ['cloth', 'cloth'], utility_vest_worn_jacket: ['cloth', 'cloth'],
    stab_vest_worn: ['cloth', 'polymer'], stab_vest_worn_jacket: ['cloth', 'polymer'],
    worn_hoodie_body: ['cloth', 'polymer'], worn_hoodie_fore: ['cloth', 'polymer'], worn_hoodie_upper: ['cloth'],
  },
  supplies={
    lamp_oil_bottle: fill('fuel-fill'),
    lighter: fill('fuel_fill:fuel_fill'),
    oil_lamp: fill('fuel_fill:fuel_fill'),
  },
)
