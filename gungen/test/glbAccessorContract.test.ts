import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly } from '@skelly/engine/assembly/schema.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGeometry } from '../src/gun/glbWriter.ts';
import { GUN_PALETTE } from '../src/gun/palette.ts';

const ROOT = join(import.meta.dirname, '..');
const folders = ['designs', 'fixtures'] as const;

const jsonFiles = (directory: string): string[] =>
  readdirSync(join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (directory.startsWith('designs') && entry.name.startsWith('look-')) {
      return [];
    }
    if (entry.isDirectory()) {
      return jsonFiles(path);
    }
    return entry.name.endsWith('.json') ? [path] : [];
  });

interface ExportCase {
  readonly key: string;
  readonly id: string;
  readonly assembly: Assembly;
}

const cases: ExportCase[] = folders.flatMap((folder) =>
  jsonFiles(folder)
    .sort()
    .map((key) => {
      const file = basename(key);
      const text = readFileSync(join(ROOT, key), 'utf8');
      let assembly: Assembly;
      if (folder === 'designs') {
        const loaded = loadGunDesign(text);
        if (!loaded.ok) {
          throw new Error(`${key}: ${loaded.error.message}`);
        }
        const { design } = loaded;
        ({ assembly } = design);
      } else {
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) {
          throw new Error(`${key}: expected fixture object`);
        }
        const record = parsed as { assembly?: Assembly } & Assembly;
        assembly = record.assembly ?? record;
      }
      return {
        key,
        id: basename(file, '.json').replaceAll('-', '_'),
        assembly,
      };
    }),
);

interface GlbJson {
  readonly meshes?: readonly {
    readonly primitives: readonly {
      readonly attributes: Readonly<Record<string, number>>;
      readonly indices?: number;
    }[];
  }[];
  readonly accessors?: readonly { readonly count: number; readonly bufferView?: number }[];
  readonly bufferViews?: readonly unknown[];
}

const parseGlbJson = (glb: Uint8Array): GlbJson => {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GlbJson;
};

const accessorError = (json: GlbJson, accessorIndex: number, label: string): string[] => {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    return [`${label} references missing accessor ${accessorIndex}`];
  }
  const errors: string[] = [];
  if (accessor.count <= 0) {
    errors.push(`${label} references empty accessor ${accessorIndex}`);
  }
  if (accessor.bufferView === undefined || !json.bufferViews?.[accessor.bufferView]) {
    errors.push(`${label} accessor ${accessorIndex} has no buffer view`);
  }
  return errors;
};

const primitiveAccessorErrors = (json: GlbJson): string[] =>
  (json.meshes ?? []).flatMap((mesh, meshIndex) =>
    mesh.primitives.flatMap((primitive, primitiveIndex) => {
      const label = `mesh ${meshIndex} primitive ${primitiveIndex}`;
      const references = [
        ...Object.values(primitive.attributes),
        ...(primitive.indices === undefined ? [] : [primitive.indices]),
      ];
      return [
        ...(references.length === 0 ? [`${label} has no accessor references`] : []),
        ...references.flatMap((accessorIndex) => accessorError(json, accessorIndex, label)),
      ];
    }),
  );

describe('GLB accessor contract', () => {
  it('covers the design and fixture export corpus', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it.each(cases)('$key emits no primitive with missing or empty accessors', ({ key, id, assembly }) => {
    // Invalid and suspended designs still probe geometry; they need no authored item mass rows.
    const result = exportGunGeometry({
      resolved: resolve(assembly, gunDomain),
      palette: GUN_PALETTE,
      appearance: {},
      asset: { id, file: `assets/models/${id}.glb` },
    });
    if (!result.ok) {
      throw new Error(`${key}: ${JSON.stringify(result.error)}`);
    }
    const json = parseGlbJson(result.glb);
    expect(json.meshes?.length ?? 0, key).toBeGreaterThan(0);
    expect(primitiveAccessorErrors(json), key).toEqual([]);
  });
});
