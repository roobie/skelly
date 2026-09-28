import { dirname, isAbsolute, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fingerprintSimulationSources, type SimulationModuleGraphHost } from '../tools/simulationFingerprint.ts';

const root = '/fixture/deadvox';

type Sources = Map<string, string>;

function hostFor(sources: Sources): SimulationModuleGraphHost {
  return {
    resolve(specifier, importer) {
      const base = isAbsolute(specifier) ? specifier : resolve(dirname(importer ?? root), specifier);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]) {
        if (sources.has(candidate)) {
          return Promise.resolve(candidate);
        }
      }
      return Promise.resolve(undefined);
    },
    readFile(path) {
      const source = sources.get(path);
      if (source === undefined) {
        return Promise.reject(new Error(`missing fixture source: ${path}`));
      }
      return Promise.resolve(source);
    },
  };
}

const hash = (sources: Sources, ...entryPaths: string[]) =>
  fingerprintSimulationSources(entryPaths, root, hostFor(sources), { exclude: ['src/ui'] });

const entries = ['src/core/sim.ts'];

describe('simulation source fingerprint', () => {
  it('includes runtime-resolved source files, not unrelated UI files or type-only imports', async () => {
    const base: Sources = new Map([
      [
        `${root}/src/core/sim.ts`,
        "import { step } from './step.ts';\nimport type { Shape } from './contract.ts';\nexport { run } from './step.ts';\n",
      ],
      [`${root}/src/core/step.ts`, "import '../ui/hud.ts';\nexport const step = () => 1;\n"],
      [`${root}/src/core/contract.ts`, 'export interface Shape { value: number }\n'],
      [`${root}/src/ui/hud.ts`, 'export const label = "alive";\n'],
    ]);
    const original = await hash(base, ...entries);

    const outsideChanged = new Map(base);
    outsideChanged.set(`${root}/src/ui/hud.ts`, 'export const label = "changed";\n');
    expect(await hash(outsideChanged, ...entries)).toBe(original);

    const typeOnlyChanged = new Map(base);
    typeOnlyChanged.set(`${root}/src/core/contract.ts`, 'export interface Shape { value: string }\n');
    expect(await hash(typeOnlyChanged, ...entries)).toBe(original);

    const runtimeChanged = new Map(base);
    runtimeChanged.set(`${root}/src/core/step.ts`, `import '../ui/hud.ts';\nexport const step = () => 2;\n`);
    expect(await hash(runtimeChanged, ...entries)).not.toBe(original);
  });

  it('includes newly imported, untracked source without consulting Git', async () => {
    const before: Sources = new Map([[`${root}/src/core/sim.ts`, 'export const tick = () => 1;\n']]);
    const beforeHash = await hash(before, ...entries);
    const after: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import { rule } from './untracked-rule.ts';\nexport const tick = () => rule();\n"],
      [`${root}/src/core/untracked-rule.ts`, 'export const rule = () => 2;\n'],
    ]);
    expect(await hash(after, ...entries)).not.toBe(beforeHash);
  });

  it('is stable across traversal order and LF/CRLF line endings', async () => {
    const lf: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import './b.ts';\nimport './a.ts';\n"],
      [`${root}/src/core/a.ts`, 'export const a = 1;\n'],
      [`${root}/src/core/b.ts`, 'export const b = 2;\n'],
    ]);
    const crlfAndReordered: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import './b.ts';\r\nimport './a.ts';\r\n"],
      [`${root}/src/core/a.ts`, 'export const a = 1;\r\n'],
      [`${root}/src/core/b.ts`, 'export const b = 2;\r\n'],
    ]);
    expect(await hash(crlfAndReordered, 'src/core/b.ts', 'src/core/sim.ts')).toBe(
      await hash(lf, 'src/core/sim.ts', 'src/core/b.ts'),
    );
  });
});
