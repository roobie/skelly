// One pill is one item, so a found pack is a stack of them; loot sizes its pill counts from this.
local pillPack = 24;
local salvage = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
local yield(item, count) = { item: item, count: count, fractions: salvage, rounding: 'floor' };
local disassembly(timeGameMinutes, yields) = { timeGameMinutes: timeGameMinutes, skill: 'crafting', yields: yields };

(import 'tools/jsonnet/lib/item-policy.libsonnet').itemPack({
  pillPack:: pillPack,
  items: [
    {
      id: 'bandage',
      name: 'Bandage',
      category: 'medical',
      model: 'bandage',
      size: [1, 1],
      stack: 4,
      treatment: { bleeding: 8 },
      disassembly: disassembly(2, [yield('cloth_strip', 1)]),
      description: 'Slows or stops bleeding on one body part.',
    },
    {
      id: 'antiseptic',
      name: 'Antiseptic',
      category: 'medical',
      model: 'antiseptic',
      weight: 100,
      size: [1, 1],
      stack: 4,
      treatment: { infection: { stages: ['early'], chance: 0.9 } },
      description: 'Treats an early wound infection.',
    },
    {
      id: 'antibiotics',
      name: 'Tetracycline',
      category: 'medical',
      model: 'antibiotics',
      weight: 50,
      size: [1, 1],
      stack: 4,
      treatment: { infection: { stages: ['advanced'], chance: 0.9 } },
      description: 'An antibiotic. Treats a progressed wound infection.',
    },
    {
      // The common analgesic: it starts within the hour and lasts a few hours (`packages/deadvox/DESIGN.md`, "Pain").
      id: 'painkillers',
      name: 'Aspirin',
      category: 'medical',
      model: 'painkillers',
      weight: 1,
      size: [1, 1],
      stack: pillPack,
      analgesic: {
        group: 'otc',
        takeSimSeconds: 2,
        reliefPerDose: 20,
        maxRelief: 30,
        onsetGameMinutes: 45,
        peakGameMinutes: 210,
        fadeGameMinutes: 60,
      },
      description: 'Eases pain for a few hours. Heals nothing.',
    },
    {
      // The opioids share one cap above the common analgesic's and blur the view while they work
      // (`packages/deadvox/DESIGN.md`, "Pain").
      id: 'codeine',
      name: 'Codeine',
      category: 'medical',
      model: 'codeine',
      weight: 1,
      size: [1, 1],
      stack: pillPack,
      analgesic: {
        group: 'opioid',
        takeSimSeconds: 2,
        reliefPerDose: 35,
        maxRelief: 50,
        onsetGameMinutes: 50,
        peakGameMinutes: 240,
        fadeGameMinutes: 90,
        vignette: 0.35,
      },
      description: 'Eases strong pain for a few hours. Heals nothing. Blurs the edges of vision while it works.',
    },
    {
      id: 'morphine',
      name: 'Morphine',
      category: 'medical',
      model: 'morphine',
      weight: 20,
      size: [1, 1],
      analgesic: {
        group: 'opioid',
        takeSimSeconds: 4,
        reliefPerDose: 60,
        maxRelief: 80,
        onsetGameMinutes: 55,
        peakGameMinutes: 300,
        fadeGameMinutes: 120,
        vignette: 0.7,
      },
      description: 'Eases severe pain for hours. Heals nothing. Blurs the edges of vision while it works.',
    },
  ],
})
