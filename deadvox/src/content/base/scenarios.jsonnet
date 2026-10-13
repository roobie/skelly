local content = import 'gauntlet.jsonnet';
local lab = import 'gauntlet-lab.libsonnet';
local service = content.templates[0];
local ground = lab.ground;
local hatch = lab.entry.hatch;
local ladder = lab.entry.ladder;
{
  scenarios: [{
    id: 'gauntlet', kind: 'gauntlet',
    body: 'player', compression: 'player',
    serviceTemplate: service.id,
    composition: {
      fixedLoot: [{
        at: [lab.surfaceOffset + 9, ground + 1, lab.surfaceOffset + 18],
        items: [{ item: 'flashlight', placement: 'surface', key: true }],
      }],
      leads: ['gauntlet_public_memo', 'gauntlet_public_directions'],
      landmarks: ['gauntlet_water_tank', 'gauntlet_loading_frame'],
      incidentalTemplates: ['gauntlet_incidental_bollard', 'gauntlet_incidental_cabinet', 'gauntlet_incidental_riser'],
      objective: lab.anchors.objective,
      objectiveFace: [lab.anchors.objective[0], lab.anchors.storeys[std.length(lab.anchors.storeys) - 1].standing[1], lab.anchors.objective[2] + 3],
      retreat: [lab.surfaceOffset + 12, ground + 1, lab.surfaceOffset + 8],
      resources: [{ at: [lab.surfaceOffset + 9, ground + 1, lab.surfaceOffset + 18], standing: [lab.surfaceOffset + 11, ground + 1, lab.surfaceOffset + 21] }],
      storeys: lab.anchors.storeys,
      descents: lab.anchors.descents,
    },
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
