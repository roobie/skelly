import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AnchorFrame,
  Design,
  DesignIssue,
  DesignLoadResult,
  DesignLocks,
  EffectiveSuggestionLocks,
  ExportGlb,
  ExportPortMetadata,
  GlbExportInput,
  GlbExportResult,
  NonEmptyReadonlyArray,
  Palette,
  SrgbColor,
  Suggest,
  SuggestionResult,
} from '@skelly/engine/core/design.ts';
import type { Resolved } from '@skelly/engine/core/resolve.ts';
import type { Domain, PartInstance } from '@skelly/engine/core/schema.ts';
import type { Template } from '@skelly/engine/core/template.ts';
import { LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { expect, expectTypeOf, it } from 'vitest';
import type {
  AnchorSelectionError,
  GunAnchorDeclarations,
  GunAnchorName,
  GunAnchorSelectionPolicy,
  SelectedAnchors,
  SelectGunAnchors,
} from '../src/gun/anchors.ts';
import type { PrefabCatalogueEntry } from '../src/gun/prefabs.ts';

const typeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });

const FORBIDDEN_CORE_IDENTIFIERS = new Set([
  'grip',
  'clamp',
  'magazine',
  'bore',
  'muzzle',
  'receiver',
  'barrel',
  'stock',
  'sight',
  'hold',
  'rearmost',
  'deadvox',
]);

const findForbiddenIdentifier = (source: string): string | undefined => {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    if (scanner.isIdentifier()) {
      const identifier = scanner.getTokenValue();
      if (FORBIDDEN_CORE_IDENTIFIERS.has(identifier.toLowerCase())) {
        return identifier;
      }
    }
  }
  return undefined;
};

const findForbiddenCoreIdentifier = (
  files: readonly string[],
  readSource: (file: string) => string = (file) => readFileSync(file, 'utf8'),
): string | undefined => {
  for (const file of files) {
    const identifier = findForbiddenIdentifier(readSource(file));
    if (identifier) {
      return `${file}: ${identifier}`;
    }
  }
  return undefined;
};

const frame: AnchorFrame = { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] };
const partWithoutInheritedLength = {
  family: 'handguard',
  params: { mount: 'clamped' },
} satisfies PartInstance;
const assembly = {
  name: 'contract-ar',
  root: 'receiver',
  parts: {
    receiver: { family: 'receiver' },
    barrel: { family: 'barrel', params: { length: 'M' } },
    handguard: partWithoutInheritedLength,
  },
  connections: [],
};
const locks: DesignLocks = { params: {}, optionalParts: [] };
const validDesign: Design = {
  format: 1,
  template: 'ar',
  assembly,
  locks,
  status: 'published',
};

it('pins the 3.0a contracts and chosen-value storage', () => {
  // @ts-expect-error every design must identify its template
  const missingTemplate: Design = { format: 1, assembly, locks, status: 'draft' };
  // @ts-expect-error only draft and published are persisted states
  const invalidStatus: Design = { format: 1, template: 'ar', assembly, locks, status: 'archived' };
  // @ts-expect-error anchor frames require both orientation directions
  const incompleteFrame: AnchorFrame = { position: [0, 0, 0] };
  // @ts-expect-error a selected set must include the winning hold frame
  const selectedWithoutHold: SelectedAnchors = { others: { muzzle: frame } };
  // @ts-expect-error the exporter accepts its explicit core input, not a gun registry
  const gunRegistryAsExportInput: GlbExportInput = {} as GunAnchorDeclarations;
  // @ts-expect-error an issueful load must downgrade a published file to a draft
  const publishedWithIssues: DesignLoadResult = {
    ok: true,
    declaredStatus: 'published',
    design: validDesign,
    issues: [{ code: 'infeasible', message: 'not publishable' }],
  };
  expectTypeOf(missingTemplate).toMatchTypeOf<Design>();
  expectTypeOf(invalidStatus).toMatchTypeOf<Design>();
  expectTypeOf(incompleteFrame).toMatchTypeOf<AnchorFrame>();
  expectTypeOf(selectedWithoutHold).toMatchTypeOf<SelectedAnchors>();
  expectTypeOf(gunRegistryAsExportInput).toMatchTypeOf<GlbExportInput>();
  expectTypeOf(publishedWithIssues).toMatchTypeOf<DesignLoadResult>();

  expect(partWithoutInheritedLength.params).not.toHaveProperty('length');

  const cleanLoad: DesignLoadResult = {
    ok: true,
    declaredStatus: 'published',
    design: validDesign,
    issues: [],
  };
  const draftLoad: DesignLoadResult = {
    ok: true,
    declaredStatus: 'published',
    design: { ...validDesign, status: 'draft' },
    issues: [{ code: 'template-choice', message: 'choice is no longer offered' }],
  };
  const failedLoad: DesignLoadResult = {
    ok: false,
    declaredStatus: undefined,
    error: { code: 'invalid-json', message: 'not JSON' },
  };
  const selectedAnchors: SelectedAnchors = { hold: frame, others: { support: frame, muzzle: frame } };
  expectTypeOf(selectedAnchors).toEqualTypeOf<SelectedAnchors>();
  const palette: Palette = {
    familyColors: { receiver: [0.2, 0.2, 0.2] },
    specialColors: { floorplate: [0.1, 0.1, 0.1] },
    fallbackColor: [136 / 255, 136 / 255, 136 / 255],
  };
  const resolved = {} as unknown as Resolved;
  const exportInput: GlbExportInput = {
    resolved,
    palette,
    asset: { id: 'ar', file: 'assets/models/ar.glb' },
  };
  const exportSuccess: GlbExportResult = { ok: true, glb: new Uint8Array() };
  const exportFailure: GlbExportResult = { ok: false, error: { code: 'unplaced-parts', partIds: ['sight'] } };
  const effectiveLocks: EffectiveSuggestionLocks = { params: { magazine: ['length'] }, optionalParts: ['sight'] };
  const suggestions: SuggestionResult = { variants: [{ ...validDesign, status: 'draft' }], exhausted: false };

  expectTypeOf<Design['format']>().toEqualTypeOf<1>();
  expectTypeOf<Design['status']>().toEqualTypeOf<'draft' | 'published'>();
  expectTypeOf<Parameters<ExportGlb>>().toEqualTypeOf<[input: GlbExportInput]>();
  expectTypeOf<ReturnType<ExportGlb>>().toEqualTypeOf<GlbExportResult>();
  expectTypeOf(exportInput).toMatchTypeOf<GlbExportInput>();
  expectTypeOf<keyof GlbExportInput>().toEqualTypeOf<
    'resolved' | 'palette' | 'appearance' | 'finish' | 'asset' | 'revolveFacets'
  >();
  expectTypeOf<Parameters<Suggest>>().toEqualTypeOf<
    [
      design: Design,
      template: Template,
      domain: Domain,
      effectiveLocks: EffectiveSuggestionLocks,
      seed: number,
      n: number,
      budget: number,
    ]
  >();
  expectTypeOf<ReturnType<Suggest>>().toEqualTypeOf<SuggestionResult>();
  type LoadWithIssues = Extract<
    DesignLoadResult,
    { readonly ok: true; readonly issues: NonEmptyReadonlyArray<DesignIssue> }
  >;
  expectTypeOf<LoadWithIssues['design']['status']>().toEqualTypeOf<'draft'>();
  expectTypeOf<LoadWithIssues['declaredStatus']>().toEqualTypeOf<'draft' | 'published'>();
  expectTypeOf<Palette['familyColors']>().toEqualTypeOf<Readonly<Record<string, SrgbColor>>>();
  expectTypeOf<keyof PrefabCatalogueEntry>().toEqualTypeOf<'id' | 'version' | 'family' | 'fixedParams'>();
  expectTypeOf<ExportPortMetadata['id']>().toEqualTypeOf<`${string}.${string}`>();
  expectTypeOf<GunAnchorName>().toEqualTypeOf<
    'hold' | 'support' | 'muzzle' | 'ejection' | 'magwell' | 'loading_port'
  >();
  expectTypeOf<Parameters<SelectGunAnchors>>().toEqualTypeOf<
    [resolved: Resolved, declarations: GunAnchorDeclarations, policy: GunAnchorSelectionPolicy]
  >();
  expectTypeOf<ReturnType<SelectGunAnchors>>().toEqualTypeOf<SelectedAnchors | AnchorSelectionError>();
  expectTypeOf(cleanLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(draftLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(failedLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(exportSuccess).toMatchTypeOf<GlbExportResult>();
  expectTypeOf(exportFailure).toMatchTypeOf<GlbExportResult>();
  expectTypeOf(effectiveLocks).toMatchTypeOf<EffectiveSuggestionLocks>();
  expectTypeOf<(typeof suggestions.variants)[number]['status']>().toEqualTypeOf<'draft'>();

  const coreRoot = fileURLToPath(new URL('../../engine/src/core/', import.meta.url));
  const coreFiles = typeScriptFiles(coreRoot);
  expect(findForbiddenCoreIdentifier(coreFiles)).toBeUndefined();
  expect(findForbiddenIdentifier('// grip\nconst label = "deadvox"; /* clamp */')).toBeUndefined();
  expect(findForbiddenIdentifier('const label = `receiver`;')).toBeUndefined();
  expect(findForbiddenIdentifier('const grip = 1;')).toBe('grip');
  let boundaryCanaryRead = false;
  const templateCanary = [
    'export const boundaryCanary = () => `',
    '$',
    '{(() => { const receiver = 1; return receiver; })()}',
    '`;',
  ].join('');
  const nestedTemplateCanary = [
    'const nested = `outer ',
    '$',
    '{ /* receiver in comment */ `inner ',
    '$',
    '{(() => { const receiver = 1; return receiver; })()}',
    '` }`;',
  ].join('');
  expect(findForbiddenIdentifier(templateCanary)).toBe('receiver');
  expect(findForbiddenIdentifier(nestedTemplateCanary)).toBe('receiver');
  const canaryViolation = findForbiddenCoreIdentifier([join(coreRoot, 'math.ts')], (file) => {
    boundaryCanaryRead = true;
    return `${readFileSync(file, 'utf8')}\n${templateCanary}`;
  });
  expect(boundaryCanaryRead).toBe(true);
  expect(canaryViolation).toContain('receiver');
});
