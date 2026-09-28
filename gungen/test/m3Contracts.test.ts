import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, expectTypeOf, it } from 'vitest';
import type {
  AnchorFrame,
  Design,
  DesignIssue,
  DesignLoadResult,
  DesignLocks,
  ExportGlb,
  ExportPortMetadata,
  GlbExportInput,
  GlbExportResult,
  NonEmptyReadonlyArray,
  Palette,
  SrgbColor,
  Suggest,
  SuggestionResult,
} from '../src/core/design.ts';
import type { Domain, PartInstance } from '../src/core/schema.ts';
import type { Template } from '../src/core/template.ts';
import type { GunAnchorDeclarations, GunAnchorName } from '../src/gun/anchors.ts';
import type { PrefabCatalogueEntry } from '../src/gun/prefabs.ts';

const assembly = { name: 'contract-test', root: 'root', parts: {}, connections: [] } as const;
const locks: DesignLocks = { params: {}, optionalParts: [] };

const CORE_IMPORT_FROM_GUN = /\b(?:from\s*|import\s*\(\s*)['"][^'"]*\/gun(?:\/|['"])/;

const typeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });

it('pins the 3.0a type contracts and keeps core independent of gun data', () => {
  // @ts-expect-error every design must identify its template
  const missingTemplate: Design = { format: 1, assembly, locks, status: 'draft' };
  // @ts-expect-error only draft and published are persisted states
  const invalidStatus: Design = { format: 1, template: 'ar', assembly, locks, status: 'archived' };
  // @ts-expect-error anchor frames require both orientation directions
  const incompleteFrame: AnchorFrame = { position: [0, 0, 0] };
  // @ts-expect-error the exporter accepts its explicit core input, not a gun registry
  const gunRegistryAsExportInput: GlbExportInput = {} as GunAnchorDeclarations;
  expectTypeOf(missingTemplate).toMatchTypeOf<Design>();
  expectTypeOf(invalidStatus).toMatchTypeOf<Design>();
  expectTypeOf(incompleteFrame).toMatchTypeOf<AnchorFrame>();
  expectTypeOf(gunRegistryAsExportInput).toMatchTypeOf<GlbExportInput>();

  const prefabPart: PartInstance = { family: 'magazine', prefab: { id: 'stanag-30', version: 1 } };
  expectTypeOf(prefabPart).toEqualTypeOf<PartInstance>();

  expectTypeOf<Design['format']>().toEqualTypeOf<1>();
  expectTypeOf<Design['status']>().toEqualTypeOf<'draft' | 'published'>();
  expectTypeOf<Parameters<ExportGlb>>().toEqualTypeOf<[input: GlbExportInput]>();
  expectTypeOf<ReturnType<ExportGlb>>().toEqualTypeOf<GlbExportResult>();
  expectTypeOf<keyof GlbExportInput>().toEqualTypeOf<'resolved' | 'anchors' | 'palette' | 'asset'>();
  expectTypeOf<Parameters<Suggest>>().toEqualTypeOf<
    [design: Design, template: Template, domain: Domain, seed: number, n: number, budget: number]
  >();
  expectTypeOf<ReturnType<Suggest>>().toEqualTypeOf<SuggestionResult>();
  type LoadWithIssues = Extract<
    DesignLoadResult,
    { readonly ok: true; readonly issues: NonEmptyReadonlyArray<DesignIssue> }
  >;
  expectTypeOf<LoadWithIssues['design']['status']>().toEqualTypeOf<'draft'>();
  expectTypeOf<Palette['familyColors']>().toEqualTypeOf<Readonly<Record<string, SrgbColor>>>();
  expectTypeOf<keyof PrefabCatalogueEntry>().toEqualTypeOf<'id' | 'version' | 'family' | 'fixedParams'>();
  expectTypeOf<ExportPortMetadata['id']>().toEqualTypeOf<`${string}.${string}`>();
  expectTypeOf<GunAnchorName>().toEqualTypeOf<'hold' | 'support' | 'muzzle'>();

  const coreDirectory = fileURLToPath(new URL('../src/core/', import.meta.url));
  const coreSource = typeScriptFiles(coreDirectory)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  expect(coreSource).not.toMatch(CORE_IMPORT_FROM_GUN);
});
