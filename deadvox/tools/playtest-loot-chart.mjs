// biome-ignore-all lint/correctness/noNodejsModules: This report is a Node-only command-line tool.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { placementOf } from '../src/core/authoredPlacement.ts';
import { buildRegistry } from '../src/core/content.ts';
import { HAMLET_BLOCK_SIZE, HAMLET_HORDE_MEMBERS, HAMLET_HORDE_TYPE } from '../src/core/hamlet.ts';
import { footprint } from '../src/core/templates.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const contentDirectory = resolve(projectRoot, 'src/content/base');
const sources = readdirSync(contentDirectory)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: readJson(resolve(contentDirectory, file)) }));
const { registry, issues } = buildRegistry(sources);
if (issues.length > 0) {
  throw new Error(issues.map(({ source, path, message }) => `${source} ${path}: ${message}`).join('\n'));
}

const map = readJson(resolve(projectRoot, 'maps/playtest.tmj'));
const mapObjects = (layers) => {
  const objects = [];
  for (const candidate of layers) {
    if (candidate.type === 'group') {
      objects.push(...mapObjects(candidate.layers ?? []));
    } else if (candidate.type === 'objectgroup') {
      objects.push(...(candidate.objects ?? []));
    }
  }
  return objects;
};
const tiledObjects = mapObjects(map.layers);
const beats = tiledObjects.filter((object) => object.type === 'beat');
const tiledBuildings = tiledObjects.filter((object) => object.type === 'building');
const playtest = registry.layouts.get('playtest');
if (!playtest) {
  throw new Error('Validated content is missing the playtest layout');
}
if (tiledBuildings.length !== playtest.buildings.length) {
  throw new Error(
    `Playtest map has ${tiledBuildings.length} building labels for ${playtest.buildings.length} registry placements`,
  );
}
const buildings = playtest.buildings.map((building, index) => {
  const tiledBuilding = tiledBuildings[index];
  const tiledTemplate = tiledBuilding.properties?.find(({ name }) => name === 'template')?.value;
  if (tiledTemplate !== building.template) {
    throw new Error(
      `Playtest building ${index + 1} template mismatch: map ${String(tiledTemplate)}, registry ${building.template}`,
    );
  }
  const placement = placementOf(registry, building);
  const [width, depth] = footprint(placement);
  return {
    building,
    name: tiledBuilding.name,
    placement,
    spawns: groupSpawns(placement.template.spawns),
    center: [
      building.position[0] + (width * HAMLET_BLOCK_SIZE) / 2,
      building.position[2] + (depth * HAMLET_BLOCK_SIZE) / 2,
    ],
  };
});

const distanceToBeat = ({ center: [x, y] }, beat) => {
  const dx = Math.max(beat.x - x, 0, x - (beat.x + beat.width));
  const dy = Math.max(beat.y - y, 0, y - (beat.y + beat.height));
  return Math.hypot(dx, dy);
};
const nearestBeat = (building) =>
  beats.reduce((best, candidate) =>
    distanceToBeat(building, candidate) < distanceToBeat(building, best) ? candidate : best,
  );
const rangeText = ([min, max]) => (min === max ? String(min) : `${min}–${max}`);
const itemName = (id) => registry.items.get(id)?.name ?? id;
const weightText = (weight, total) => `${weight}/${total} (${((100 * weight) / total).toFixed(1)}%)`;
const sortedTables = (tableCounts) => [...tableCounts].sort(([a], [b]) => a.localeCompare(b));

const describeTable = (tableId, indent = '    ', seen = new Set()) => {
  const table = registry.loot.get(tableId);
  if (!table) {
    return [`${indent}Missing table ${tableId}`];
  }
  if (seen.has(tableId)) {
    return [`${indent}${tableId} (cycle)`];
  }
  return tableLines(table, indent, new Set(seen).add(tableId));
};

function tableLines(table, indent, seen) {
  const lines = [`${indent}${table.id}: ${rangeText(table.rolls)} roll${table.rolls[1] === 1 ? '' : 's'}`];
  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  return lines.concat(table.entries.flatMap((entry) => tableEntryLines(entry, totalWeight, indent, seen)));
}

function tableEntryLines(entry, totalWeight, indent, seen) {
  const choice = weightText(entry.weight, totalWeight);
  if (entry.nothing) {
    return [`${indent}  - weight ${choice} → nothing`];
  }
  if (entry.item !== undefined) {
    const count = entry.count === undefined ? '1' : rangeText(entry.count);
    const condition = entry.condition === undefined ? '' : `, condition ${rangeText(entry.condition)}`;
    return [`${indent}  - weight ${choice} → ${itemName(entry.item)} ×${count}${condition}`];
  }
  if (entry.table === undefined) {
    return [];
  }
  const nested = registry.loot.get(entry.table);
  if (!nested) {
    return [`${indent}  - weight ${choice} → missing table ${entry.table}`];
  }
  if (seen.has(entry.table)) {
    return [`${indent}  - weight ${choice} → ${entry.table} (cycle)`];
  }
  return [
    `${indent}  - weight ${choice} → nested table:`,
    ...tableLines(nested, `${indent}    `, new Set(seen).add(entry.table)),
  ];
}

const fixedLootLines = (building) =>
  (building.fixedLoot ?? []).flatMap((override) =>
    override.items.map((item) => {
      const key = item.key === true ? ' [key]' : '';
      const fitted = Object.values(item.fitted ?? {}).map(itemName);
      const fittedText = fitted.length > 0 ? ` with ${fitted.join(', ')} fitted` : '';
      return `    - ${itemName(item.item)} ×${item.count ?? 1}${fittedText}${key}`;
    }),
  );

function groupSpawns(spawns) {
  const groups = new Map();
  for (const spawn of spawns) {
    const key = `${spawn.zombie}\u0000${spawn.chance}`;
    const group = groups.get(key) ?? { zombie: spawn.zombie, chance: spawn.chance, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.zombie.localeCompare(b.zombie) || a.chance - b.chance);
}

const furnitureLootLines = (placement) => {
  const tableCounts = new Map();
  for (const piece of placement.template.pieces) {
    if (piece.loot !== undefined) {
      tableCounts.set(piece.loot, (tableCounts.get(piece.loot) ?? 0) + 1);
    }
  }
  if (tableCounts.size === 0) {
    return [];
  }
  return [
    '    Furniture loot tables:',
    ...sortedTables(tableCounts).flatMap(([tableId, count]) => [
      `    - ${tableId} (${count} furniture anchor${count === 1 ? '' : 's'}):`,
      ...describeTable(tableId, '      '),
    ]),
  ];
};

const templateZombieLines = (spawns) => {
  if (spawns.length === 0) {
    return [];
  }
  return [
    '    Template zombies:',
    ...spawns.map((spawn) => {
      const zombie = registry.zombies.get(spawn.zombie);
      const chance = `${(spawn.chance * 100).toFixed(1)}%`;
      const markerWord = spawn.count === 1 ? 'marker' : 'markers';
      const drop = zombie?.loot === undefined ? 'no drop table' : `drops via \`${zombie.loot}\` (see Zombie drops)`;
      return `    - ${zombie?.name ?? spawn.zombie}: ${spawn.count} ${markerWord}, ${chance} chance each; ${drop}`;
    }),
  ];
};

const buildingLootLines = ({ building, name, placement, spawns }) => {
  const fixed = fixedLootLines(building);
  const furniture = furnitureLootLines(placement);
  const zombies = templateZombieLines(spawns);
  if (fixed.length + furniture.length + zombies.length === 0) {
    return [];
  }
  return [
    `  - ${name} (${building.template})`,
    ...(fixed.length > 0 ? ['    Fixed loot:', ...fixed] : []),
    ...furniture,
    ...zombies,
  ];
};

const zombieSources = new Map();
const sourceForZombie = (id) => {
  let source = zombieSources.get(id);
  if (!source) {
    source = { map: new Map(), templates: new Map(), hordes: 0 };
    zombieSources.set(id, source);
  }
  return source;
};
const addSpawnCounts = (counts, chance, count = 1) => counts.set(chance, (counts.get(chance) ?? 0) + count);

for (const spawn of playtest.shamblers) {
  addSpawnCounts(sourceForZombie(spawn.type).map, spawn.chance ?? 1);
}
for (const { spawns } of buildings) {
  for (const spawn of spawns) {
    addSpawnCounts(sourceForZombie(spawn.zombie).templates, spawn.chance, spawn.count);
  }
}
for (const _horde of playtest.hordes ?? []) {
  const hordeSource = sourceForZombie(HAMLET_HORDE_TYPE);
  hordeSource.hordes += 1;
}

const markerCount = (count) => `${count} ${count === 1 ? 'marker' : 'markers'}`;
const describeChanceCounts = (counts) =>
  [...counts]
    .sort(([a], [b]) => a - b)
    .map(([chance, count]) => `${markerCount(count)} at ${(chance * 100).toFixed(1)}% chance`)
    .join(', ');

const zombieSourceText = (source) =>
  [
    ...(source.map.size > 0 ? [`map: ${describeChanceCounts(source.map)}`] : []),
    ...(source.templates.size > 0 ? [`templates: ${describeChanceCounts(source.templates)}`] : []),
    ...(source.hordes > 0
      ? [`hordes: ${markerCount(source.hordes)} ×${rangeText(HAMLET_HORDE_MEMBERS)} members each`]
      : []),
  ].join('; ') || 'no authored source';

const outsideLootLines = () => {
  const lines = [
    '## Zombie drops',
    '',
    'Map and template spawns can drop these tables on death; route tracks do not place loot.',
  ];
  const tableUsers = new Map();
  for (const [typeId, source] of [...zombieSources].sort(([a], [b]) => a.localeCompare(b))) {
    const zombie = registry.zombies.get(typeId);
    const tableId = zombie?.loot;
    const loot = tableId === undefined ? 'no drop table' : `\`${tableId}\``;
    lines.push(`- ${zombie?.name ?? typeId} (${zombieSourceText(source)}): ${loot}`);
    if (tableId !== undefined) {
      const users = tableUsers.get(tableId) ?? [];
      users.push(zombie?.name ?? typeId);
      tableUsers.set(tableId, users);
    }
  }
  for (const [tableId, users] of [...tableUsers].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push('', `### \`${tableId}\``, `Used by: ${users.join(', ')}`);
    lines.push(...describeTable(tableId, '  '));
  }
  return lines;
};

const lines = [
  '# Playtest loot progression',
  '',
  'Buildings are grouped under their nearest beat area by building-center distance; ties follow Beats layer order.',
  'Fixed container items are furnished before rolled filler; a full container can crowd it out (see `src/core/inventory.ts`, `Inventory.furnish`).',
  'Fixed items are authored placements. Weighted table choices are per roll; roll and item counts are inclusive ranges.',
  '',
];
for (const beat of beats) {
  lines.push(`## ${beat.name}`, '');
  const assigned = buildings.filter((building) => nearestBeat(building) === beat);
  const lootLines = assigned.flatMap(buildingLootLines);
  if (lootLines.length === 0) {
    lines.push('No buildings with loot in this beat area.');
  } else {
    lines.push(...lootLines);
  }
  lines.push('');
}
lines.push(...outsideLootLines());
process.stdout.write(`${lines.join('\n')}\n`);
