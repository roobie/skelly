// biome-ignore-all lint/correctness/noNodejsModules: This report is a Node-only command-line tool.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { buildRegistry } from '@skelly/engine/content';
import { claimedId } from '@skelly/engine/inventory';
import { compareCodeUnits } from '@skelly/engine/packs';
import { footprint, HORDE_MEMBERS, placementOf, TEMPLATE_BLOCK_SIZE } from '@skelly/engine/world';
import { readStackContentSources } from './readBundledPacks.ts';

/**
 * @import { ContentFile } from '@skelly/engine/content'
 * @import { Placement } from '@skelly/engine/world'
 */
/** @typedef {NonNullable<ContentFile['loot']>[number]} LootTable */
/** @typedef {LootTable['entries'][number]} LootEntry */
/** @typedef {NonNullable<ContentFile['layouts']>[number]['buildings'][number]} LayoutBuilding */
/** @typedef {Placement['template']['spawns']} TemplateSpawns */
/** @typedef {{ name: string; value: unknown }} TiledProperty */
/**
 * @typedef {{
 *   type: string;
 *   name: string;
 *   x: number;
 *   y: number;
 *   width: number;
 *   height: number;
 *   properties?: TiledProperty[];
 * }} TiledObject
 */
/** @typedef {{ type: string; layers?: TiledLayer[]; objects?: TiledObject[] }} TiledLayer */
/** @typedef {{ layers: TiledLayer[] }} TiledMap */
/** @typedef {{ actor: string; chance: number; count: number }} SpawnGroup */
/**
 * @typedef {{
 *   building: LayoutBuilding;
 *   name: string;
 *   placement: Placement;
 *   spawns: readonly SpawnGroup[];
 *   center: readonly [number, number];
 * }} ChartBuilding
 */
/** @typedef {{ map: Map<number, number>; templates: Map<number, number>; hordes: number }} ZombieSource */

const projectRoot = resolve(import.meta.dirname, '..');
/**
 * @param {string} path
 * @returns {unknown}
 */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const { registry, issues } = buildRegistry(readStackContentSources(projectRoot, 'skelly.deadvox'));
if (issues.length > 0) {
  throw new Error(issues.map(({ source, path, message }) => `${source} ${path}: ${message}`).join('\n'));
}

const map = /** @type {TiledMap} */ (readJson(resolve(projectRoot, 'maps/playtest.tmj')));
/**
 * @param {readonly TiledLayer[]} layers
 * @returns {TiledObject[]}
 */
const mapObjects = (layers) => {
  /** @type {TiledObject[]} */
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
/** @type {readonly ChartBuilding[]} */
const buildings = playtest.buildings.map((building, index) => {
  const tiledBuilding = tiledBuildings[index];
  if (!tiledBuilding) {
    throw new Error(`Playtest map has no building label for registry placement ${index + 1}`);
  }
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
      building.position[0] + (width * TEMPLATE_BLOCK_SIZE) / 2,
      building.position[2] + (depth * TEMPLATE_BLOCK_SIZE) / 2,
    ],
  };
});

/**
 * @param {ChartBuilding} building
 * @param {TiledObject} beat
 */
const distanceToBeat = ({ center: [x, y] }, beat) => {
  const dx = Math.max(beat.x - x, 0, x - (beat.x + beat.width));
  const dy = Math.max(beat.y - y, 0, y - (beat.y + beat.height));
  return Math.hypot(dx, dy);
};
/** @param {ChartBuilding} building */
const nearestBeat = (building) =>
  beats.reduce((best, candidate) =>
    distanceToBeat(building, candidate) < distanceToBeat(building, best) ? candidate : best,
  );
/** @param {readonly [number, number]} range */
const rangeText = ([min, max]) => (min === max ? String(min) : `${min}–${max}`);
/** @param {string} id */
const itemName = (id) => registry.items.get(id)?.name ?? id;
/**
 * @param {number} weight
 * @param {number} total
 */
const weightText = (weight, total) => `${weight}/${total} (${((100 * weight) / total).toFixed(1)}%)`;
/** @param {ReadonlyMap<string, number>} tableCounts */
const sortedTables = (tableCounts) => [...tableCounts].sort(([a], [b]) => compareCodeUnits(a, b));

/**
 * @param {string} tableId
 * @param {string} [indent]
 * @param {ReadonlySet<string>} [seen]
 * @returns {string[]}
 */
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

/**
 * @param {LootTable} table
 * @param {string} indent
 * @param {ReadonlySet<string>} seen
 * @returns {string[]}
 */
function tableLines(table, indent, seen) {
  const lines = [`${indent}${table.id}: ${rangeText(table.rolls)} roll${table.rolls[1] === 1 ? '' : 's'}`];
  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  return lines.concat(table.entries.flatMap((entry) => tableEntryLines(entry, totalWeight, indent, seen)));
}

/**
 * @param {LootEntry} entry
 * @param {number} totalWeight
 * @param {string} indent
 * @param {ReadonlySet<string>} seen
 * @returns {string[]}
 */
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

/** @param {LayoutBuilding} building */
const fixedLootLines = (building) =>
  (building.fixedLoot ?? []).flatMap((override) =>
    override.items.map((item) => {
      const key = item.key === true ? ' [key]' : '';
      const fitted = Object.values(item.fitted ?? {}).map(itemName);
      const fittedText = fitted.length > 0 ? ` with ${fitted.join(', ')} fitted` : '';
      return `    - ${itemName(item.item)} ×${item.count ?? 1}${fittedText}${key}`;
    }),
  );

/** @param {TemplateSpawns} spawns */
function groupSpawns(spawns) {
  /** @type {Map<string, SpawnGroup>} */
  const groups = new Map();
  for (const spawn of spawns) {
    const key = `${spawn.actor}\u0000${spawn.chance}`;
    const group = groups.get(key) ?? { actor: spawn.actor, chance: spawn.chance, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => compareCodeUnits(a.actor, b.actor) || a.chance - b.chance);
}

/** @param {Placement} placement */
const furnitureLootLines = (placement) => {
  /** @type {Map<string, number>} */
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

/** @param {readonly SpawnGroup[]} spawns */
const templateZombieLines = (spawns) => {
  if (spawns.length === 0) {
    return [];
  }
  return [
    '    Template zombies:',
    ...spawns.map((spawn) => {
      const zombie = registry.actors.get(spawn.actor);
      const chance = `${(spawn.chance * 100).toFixed(1)}%`;
      const markerWord = spawn.count === 1 ? 'marker' : 'markers';
      const drop = zombie?.loot === undefined ? 'no drop table' : `drops via \`${zombie.loot}\` (see Zombie drops)`;
      return `    - ${zombie?.name ?? spawn.actor}: ${spawn.count} ${markerWord}, ${chance} chance each; ${drop}`;
    }),
  ];
};

/** @param {ChartBuilding} building */
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

/** @type {Map<string, ZombieSource>} */
const zombieSources = new Map();
/** @param {string} id */
const sourceForZombie = (id) => {
  let source = zombieSources.get(id);
  if (!source) {
    source = { map: new Map(), templates: new Map(), hordes: 0 };
    zombieSources.set(id, source);
  }
  return source;
};
/**
 * @param {Map<number, number>} counts
 * @param {number} chance
 */
const addSpawnCounts = (counts, chance, count = 1) => counts.set(chance, (counts.get(chance) ?? 0) + count);

for (const spawn of playtest.actors) {
  addSpawnCounts(sourceForZombie(spawn.type).map, spawn.chance ?? 1);
}
for (const { spawns } of buildings) {
  for (const spawn of spawns) {
    addSpawnCounts(sourceForZombie(spawn.actor).templates, spawn.chance, spawn.count);
  }
}
for (const _horde of playtest.hordes ?? []) {
  const hordeSource = sourceForZombie(claimedId(registry.actors, 'settlementHorde'));
  hordeSource.hordes += 1;
}

/** @param {number} count */
const markerCount = (count) => `${count} ${count === 1 ? 'marker' : 'markers'}`;
/** @param {ReadonlyMap<number, number>} counts */
const describeChanceCounts = (counts) =>
  [...counts]
    .sort(([a], [b]) => a - b)
    .map(([chance, count]) => `${markerCount(count)} at ${(chance * 100).toFixed(1)}% chance`)
    .join(', ');

/** @param {ZombieSource} source */
const zombieSourceText = (source) =>
  [
    ...(source.map.size > 0 ? [`map: ${describeChanceCounts(source.map)}`] : []),
    ...(source.templates.size > 0 ? [`templates: ${describeChanceCounts(source.templates)}`] : []),
    ...(source.hordes > 0 ? [`hordes: ${markerCount(source.hordes)} ×${rangeText(HORDE_MEMBERS)} members each`] : []),
  ].join('; ') || 'no authored source';

const outsideLootLines = () => {
  const lines = [
    '## Zombie drops',
    '',
    'Map and template spawns can drop these tables on death; route tracks do not place loot.',
  ];
  const tableUsers = new Map();
  for (const [typeId, source] of [...zombieSources].sort(([a], [b]) => compareCodeUnits(a, b))) {
    const zombie = registry.actors.get(typeId);
    const tableId = zombie?.loot;
    const loot = tableId === undefined ? 'no drop table' : `\`${tableId}\``;
    lines.push(`- ${zombie?.name ?? typeId} (${zombieSourceText(source)}): ${loot}`);
    if (tableId !== undefined) {
      const users = tableUsers.get(tableId) ?? [];
      users.push(zombie?.name ?? typeId);
      tableUsers.set(tableId, users);
    }
  }
  for (const [tableId, users] of [...tableUsers].sort(([a], [b]) => compareCodeUnits(a, b))) {
    lines.push('', `### \`${tableId}\``, `Used by: ${users.join(', ')}`);
    lines.push(...describeTable(tableId, '  '));
  }
  return lines;
};

const lines = [
  '# Playtest loot progression',
  '',
  'Buildings are grouped under their nearest beat area by building-center distance; ties follow Beats layer order.',
  'Fixed container items are furnished before rolled filler; a full container can crowd it out (see `packages/engine/src/core/inventory.ts`, `Inventory.furnish`).',
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
