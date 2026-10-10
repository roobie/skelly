// biome-ignore-all lint/correctness/noNodejsModules: This report is a Node-only command-line tool.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { buildRegistry } from '../src/core/content.ts';
import { HAMLET_HORDE_TYPE } from '../src/core/hamlet.ts';
import { compileTemplate } from '../src/core/templates.ts';

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
const layer = (name) => {
  const found = map.layers.find((candidate) => candidate.name === name);
  if (!found) {
    throw new Error(`Playtest map is missing the ${name} layer`);
  }
  return found;
};
const properties = (object) => Object.fromEntries((object.properties ?? []).map(({ name, value }) => [name, value]));
const beats = layer('Beats').objects;
const buildings = layer('Buildings').objects;

const distanceToBeat = (building, beat) => {
  const x = building.x + building.width / 2;
  const y = building.y + building.height / 2;
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

const fixedLootLines = (object) => {
  const raw = properties(object).fixed_loot;
  let fixedLoot = raw;
  if (raw === undefined || raw === '') {
    fixedLoot = [];
  } else if (typeof raw === 'string') {
    fixedLoot = JSON.parse(raw);
  }
  return fixedLoot.flatMap((override) =>
    override.items.map((item) => {
      const key = item.key === true ? ' [key]' : '';
      return `    - ${itemName(item.item)} ×${item.count ?? 1}${key}`;
    }),
  );
};

const buildingLootLines = (object) => {
  const props = properties(object);
  const templateId = props.template;
  const template = registry.templates.get(templateId);
  if (!template) {
    throw new Error(`${object.name}: unknown template ${String(templateId)}`);
  }
  const fixedLines = fixedLootLines(object);
  const tableCounts = new Map();
  for (const piece of compileTemplate(registry, template).pieces) {
    if (piece.loot !== undefined) {
      tableCounts.set(piece.loot, (tableCounts.get(piece.loot) ?? 0) + 1);
    }
  }
  if (fixedLines.length === 0 && tableCounts.size === 0) {
    return [];
  }
  const lines = [`  - ${object.name || `Building ${object.id}`} (${templateId})`];
  if (fixedLines.length > 0) {
    lines.push('    Fixed loot:');
    lines.push(...fixedLines);
  }
  if (tableCounts.size > 0) {
    lines.push('    Furniture loot tables:');
    for (const [tableId, count] of sortedTables(tableCounts)) {
      lines.push(`    - ${tableId} (${count} furniture anchor${count === 1 ? '' : 's'}):`);
      lines.push(...describeTable(tableId, '      '));
    }
  }
  return lines;
};

const outsideLootLines = () => {
  const spawnObjects = layer('Spawns').objects;
  const types = new Map();
  for (const object of spawnObjects) {
    const props = properties(object);
    const zombieType = props.zombie ?? (object.type === 'horde' ? HAMLET_HORDE_TYPE : undefined);
    if (zombieType !== undefined) {
      types.set(zombieType, (types.get(zombieType) ?? 0) + 1);
    }
  }
  const lines = [
    '## Outside-building loot',
    '',
    'Route tracks do not place loot; mapped zombies can drop these tables on death.',
  ];
  let found = false;
  for (const [typeId, count] of [...types].sort(([a], [b]) => a.localeCompare(b))) {
    const zombie = registry.zombies.get(typeId);
    if (zombie?.loot === undefined) {
      continue;
    }
    found = true;
    lines.push(`- ${zombie.name} (${count} authored spawn marker${count === 1 ? '' : 's'}):`);
    lines.push(...describeTable(zombie.loot, '  '));
  }
  if (!found) {
    lines.push('- None');
  }
  return lines;
};

const lines = [
  '# Playtest loot progression',
  '',
  'Buildings are grouped under their nearest beat area by building-center distance; ties follow Beats layer order.',
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
