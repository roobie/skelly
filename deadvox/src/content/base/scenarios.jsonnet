local look = import 'gauntlet-look.jsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local service = look.templates[0];
local ground = lab.ground;
local hatch = lab.entry.hatch;
local ladder = lab.entry.ladder;
{
  scenarios: [{
    id: 'gauntlet', kind: 'gauntlet',
    body: 'player', compression: 'player',
    serviceTemplate: service.id,
    portal: {
      hatch: 'T', ladder: 'H',
      upper: [hatch[0] + 4, ground + 1, hatch[2] + 1],
      lower: [hatch[0], ladder[1], hatch[2] + 1],
    },
    city: {
      blocksX: 1, blocksZ: 1,
      street: 12,
      blockX: std.max(service.size[0], service.size[2]) + 24,
      blockZ: std.max(service.size[0], service.size[2]) + 24,
      pad: 2, gap: 2, blend: 24,
      templates: ['small_house', 'shed', 'workshop_hall'],
    },
  }],
}
