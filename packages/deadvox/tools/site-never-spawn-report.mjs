// biome-ignore-all lint/correctness/noNodejsModules: This report is a Node-only command-line tool.
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { buildRegistry } from '../src/core/content.ts';
import { checkStartReachability } from '../src/core/reachability.ts';

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

const report = (registry, siteId, startId) => {
  const layout = registry.layouts.get(siteId);
  if (layout?.demo) {
    throw new Error(`Demo layout "${siteId}" is not a playable site`);
  }
  if (!(layout || registry.scenarios.has(siteId))) {
    throw new Error(`Unknown playable site "${siteId}"`);
  }
  const start =
    startId === undefined
      ? [...registry.starts.values()].find((row) => row.site === siteId && row.defaultForSite)
      : registry.starts.get(startId);
  if (!start || start.site !== siteId) {
    throw new Error(`Select an admitted start for site "${siteId}" with --start`);
  }
  const siteReachability = checkStartReachability(registry, start, { sites: new Set([siteId]) });
  const wholeGame = checkStartReachability(registry, start);
  const globallyUnreachable = new Set(wholeGame.unreachable);
  const siteSpecific = siteReachability.unreachable.filter((id) => !globallyUnreachable.has(id));
  const neverPlaced = siteSpecific.filter((id) => wholeGame.placed.has(id));
  const neverRolled = siteSpecific.filter((id) => !wholeGame.placed.has(id) && wholeGame.rolled.has(id));
  const notCraftable = siteSpecific.filter((id) => !(wholeGame.placed.has(id) || wholeGame.rolled.has(id)));
  const lines = [
    `# ${siteId} never-spawn report (start ${start.id})`,
    '',
    'Static content analysis: a pool member counts as possible. This is not a seeded-run result.',
    `The site-specific gap is ${siteSpecific.length} of ${siteReachability.defined} loot-eligible items.`,
    '',
  ];
  section(lines, 'Never placed by this site’s layouts or templates', neverPlaced, registry);
  section(lines, 'Never in a loot table this site can roll', neverRolled, registry);
  section(lines, 'Not craftable or disassemblable from what this site yields', notCraftable, registry);
  section(
    lines,
    'Unreachable across all sites with this start; see npm run validate',
    siteReachability.unreachable.filter((id) => globallyUnreachable.has(id)),
    registry,
  );
  return `${lines.join('\n')}\n`;
};

export const runReport = (
  args,
  write = (text) => process.stdout.write(text),
  fail = (text) => process.stderr.write(text),
  readRegistry = registryFromBaseContent,
) => {
  try {
    const { values, positionals } = parseArgs({
      args,
      options: { site: { type: 'string' }, start: { type: 'string' } },
      allowPositionals: true,
    });
    const requestedSite = values.site ?? positionals[0];
    if (requestedSite === undefined || positionals.length > (values.site === undefined ? 1 : 0)) {
      throw new Error('Usage: npm run report:never-spawn -- <site-id> [--start <start-id>]');
    }
    write(report(readRegistry(), requestedSite, values.start));
    return 0;
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runReport(process.argv.slice(2));
}
