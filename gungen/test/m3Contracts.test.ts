import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { expect, expectTypeOf, it } from 'vitest';
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
} from '../src/core/design.ts';
import type { Resolved } from '../src/core/resolve.ts';
import type { Domain, PartInstance } from '../src/core/schema.ts';
import type { Template } from '../src/core/template.ts';
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

const isWithin = (directory: string, path: string): boolean => {
  const relativePath = relative(directory, path);
  return (
    relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
};

const resolveSourceImport = (from: string, specifier: string): string | undefined => {
  const target = resolve(dirname(from), specifier);
  const candidates = extname(target)
    ? [target]
    : [`${target}.ts`, `${target}.tsx`, `${target}.mts`, `${target}.js`, join(target, 'index.ts')];
  return candidates.find(existsSync);
};

type ParsedImport = ReturnType<typeof parse>[0][number];
type VisitModule = (file: string) => Promise<string | undefined>;

interface ImportWalkContext {
  readonly sourceRoot: string;
  readonly gunRoot: string;
  readonly visitModule: VisitModule;
}

const inspectImport = (
  imported: ParsedImport,
  from: string,
  context: ImportWalkContext,
): string | undefined | Promise<string | undefined> => {
  if (imported.type === 'import-meta') {
    return undefined;
  }
  if (imported.specifier === undefined || (imported.type === 'dynamic' && imported.glob)) {
    return `unresolved dynamic import in ${from}`;
  }
  if (!imported.specifier.startsWith('.')) {
    return undefined;
  }
  const target = resolveSourceImport(from, imported.specifier);
  if (!target) {
    return `unresolved relative import ${imported.specifier} from ${from}`;
  }
  if (isWithin(context.gunRoot, target)) {
    return `${from} -> ${target}`;
  }
  return isWithin(context.sourceRoot, target) ? context.visitModule(target) : undefined;
};

/** Walks relative imports transitively; unresolved dynamic/glob imports fail closed. */
const findGunImport = async (
  entryFiles: readonly string[],
  sourceRoot: string,
  gunRoot: string,
): Promise<string | undefined> => {
  await init();
  const visited = new Set<string>();
  let visit: VisitModule;
  const context: ImportWalkContext = {
    sourceRoot,
    gunRoot,
    visitModule: (file) => visit(file),
  };
  visit = async (file) => {
    const absoluteFile = resolve(file);
    if (visited.has(absoluteFile)) {
      return;
    }
    visited.add(absoluteFile);
    const [imports] = parse(readFileSync(absoluteFile, 'utf8'), absoluteFile);
    const results = await Promise.all(imports.map((imported) => inspectImport(imported, absoluteFile, context)));
    return results.find((result) => result !== undefined);
  };

  const results = await Promise.all(entryFiles.map(visit));
  return results.find((result) => result !== undefined);
};

interface ImportFixtureResults {
  readonly target: string;
  readonly sideEffect: string | undefined;
  readonly templateLiteral: string | undefined;
  readonly dynamicGlob: string | undefined;
  readonly transitive: string | undefined;
}

const scanImportFixtures = async (): Promise<ImportFixtureResults> => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'gungen-core-import-guard-'));
  const sourceRoot = join(fixtureRoot, 'src');
  const coreRoot = join(sourceRoot, 'core');
  const gunRoot = join(sourceRoot, 'gun');
  const bridgeRoot = join(sourceRoot, 'bridge');
  mkdirSync(coreRoot, { recursive: true });
  mkdirSync(gunRoot, { recursive: true });
  mkdirSync(bridgeRoot, { recursive: true });

  try {
    const target = join(gunRoot, 'target.ts');
    writeFileSync(target, 'export const fixture = true;\n');
    const sideEffect = join(coreRoot, 'side-effect.ts');
    writeFileSync(sideEffect, "import '../gun/target.ts';\n");
    const templateLiteral = join(coreRoot, 'template-literal.ts');
    writeFileSync(templateLiteral, 'import(`../gun/target.ts`);\n');
    const dynamicGlob = join(coreRoot, 'dynamic-glob.ts');
    const dollar = String.fromCharCode(36);
    writeFileSync(dynamicGlob, `import(\`../gun/${dollar}{family}.ts\`);\n`);
    const transitive = join(coreRoot, 'transitive.ts');
    const bridge = join(bridgeRoot, 're-export.ts');
    writeFileSync(transitive, "import '../bridge/re-export.ts';\n");
    writeFileSync(bridge, "export * from '../gun/target.ts';\n");

    const [sideEffectResult, templateLiteralResult, dynamicGlobResult, transitiveResult] = await Promise.all([
      findGunImport([sideEffect], sourceRoot, gunRoot),
      findGunImport([templateLiteral], sourceRoot, gunRoot),
      findGunImport([dynamicGlob], sourceRoot, gunRoot),
      findGunImport([transitive], sourceRoot, gunRoot),
    ]);
    return {
      target,
      sideEffect: sideEffectResult,
      templateLiteral: templateLiteralResult,
      dynamicGlob: dynamicGlobResult,
      transitive: transitiveResult,
    };
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
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

it('pins the 3.0a contracts, chosen-value storage, and import boundary', async () => {
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
  expectTypeOf<GunAnchorName>().toEqualTypeOf<'hold' | 'support' | 'muzzle' | 'ejection'>();
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

  const sourceRoot = fileURLToPath(new URL('../src/', import.meta.url));
  const coreRoot = join(sourceRoot, 'core');
  const gunRoot = join(sourceRoot, 'gun');
  const coreFiles = typeScriptFiles(coreRoot);
  expect(await findGunImport(coreFiles, sourceRoot, gunRoot)).toBeUndefined();
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
  const fixtureViolations = await scanImportFixtures();
  expect(fixtureViolations.sideEffect).toContain(fixtureViolations.target);
  expect(fixtureViolations.templateLiteral).toContain(fixtureViolations.target);
  expect(fixtureViolations.dynamicGlob).toContain('unresolved dynamic import');
  expect(fixtureViolations.transitive).toContain(fixtureViolations.target);
});
