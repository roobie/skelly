// biome-ignore-all lint/correctness/noNodejsModules: This report is a Node-only command-line tool.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { buildRegistry } from '../src/core/content.ts';
import { checkReachability } from '../src/core/reachability.ts';

const projectRoot = resolve(import.meta.dirname, '..');
const contentDirectory = resolve(projectRoot, 'src/content/base');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const registryFromBaseContent = () => {
  const sources = readdirSync(contentDirectory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: readJson(resolve(contentDirectory, file)) }));
  const { registry, issues } = buildRegistry(sources);
  if (issues.length > 0) {
    throw new Error(issues.map(({ source, path, message }) => `${source} ${path}: ${message}`).join('\n'));
  }
  return registry;
};

const itemLine = (registry, id) => `- ${registry.items.get(id)?.name ?? id} (${id})`;
const section = (lines, title, ids, registry) => {
  lines.push(`## ${title}`, '');
  if (ids.length === 0) {
    lines.push('None.');
  } else {
    lines.push(...ids.map((id) => itemLine(registry, id)));
  }
  lines.push('');
};

const report = (siteId) => {
  const registry = registryFromBaseContent();
  if (!(registry.layouts.has(siteId) || registry.scenarios.has(siteId))) {
    throw new Error(`Unknown playable site "${siteId}"`);
  }
  const siteReachability = checkReachability(registry, undefined, { sites: new Set([siteId]) });
  const wholeGame = checkReachability(registry);
  const { unreachable } = siteReachability;
  const neverPlaced = unreachable.filter((id) => wholeGame.placed.has(id));
  const neverRolled = unreachable.filter((id) => !wholeGame.placed.has(id) && wholeGame.rolled.has(id));
  const notCraftable = unreachable.filter((id) => !(wholeGame.placed.has(id) || wholeGame.rolled.has(id)));
  const lines = [
    `# ${siteId} never-spawn report`,
    '',
    'Static content analysis: a pool member counts as possible. This is not a seeded-run result.',
    `The lists cover loot-eligible items that this site cannot yield (${unreachable.length} of ${siteReachability.defined}).`,
    '',
  ];
  section(lines, 'Never placed by this site’s layouts or templates', neverPlaced, registry);
  section(lines, 'Never in a loot table this site can roll', neverRolled, registry);
  section(lines, 'Not craftable or disassemblable from what this site yields', notCraftable, registry);
  process.stdout.write(`${lines.join('\n')}\n`);
};

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: { site: { type: 'string' } },
  allowPositionals: true,
});
const requestedSite = values.site ?? positionals[0];
if (requestedSite === undefined || positionals.length > (values.site === undefined ? 1 : 0)) {
  process.stderr.write('Usage: npm run report:never-spawn -- <site-id>\n');
  process.exitCode = 1;
} else {
  try {
    report(requestedSite);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
