// Spike: exports only the named thing-tool items into a scratch folder, never into deadvox content,
// so an authoring agent can preview its rows quickly and parallel agents do not write the same files.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { compileJsonnetSources } from './jsonnet/compile.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: 'model-preview' } } });
const t0 = performance.now();
compileJsonnetSources({ within: ['packages/thing-core/src', 'packages/thing-authoring-tool', 'packages/deadvox/src/content/base/presentation'] });
const t1 = performance.now();
const { loadThingRecipe } = await import('../packages/thing-authoring-tool/src/exports.ts');
const rows = loadThingRecipe().filter(({ id }) => positionals.length === 0 || positionals.includes(id));
const t2 = performance.now();
const out = resolve(values.out);
mkdirSync(out, { recursive: true });
for (const { id, generate } of rows) writeFileSync(join(out, `${id}.glb`), generate().glb);
const t3 = performance.now();
const s = (a, b) => `${((b - a) / 1000).toFixed(1)} s`;
console.log(`${rows.length} exported to ${out}: compile ${s(t0, t1)}, load ${s(t1, t2)}, generate ${s(t2, t3)}`);
