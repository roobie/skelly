import { expectTypeOf, it } from 'vitest';
import type { AnchorFrame } from '../src/assembly/anchors.ts';
import type {
  Design,
  DesignIssue,
  DesignLoadResult,
  DesignLocks,
  EffectiveSuggestionLocks,
  NonEmptyReadonlyArray,
  Suggest,
  SuggestionResult,
} from '../src/assembly/design.ts';
import type { Domain, PartInstance } from '../src/assembly/schema.ts';
import type { Template } from '../src/assembly/template.ts';

// Type-level only: the typecheck enforces these contracts. The domain-neutral source scan lives in
// engineImportBoundary.test.ts.
it("pins the engine's 3.0a contracts and chosen-value storage", () => {
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
  // @ts-expect-error every design must identify its template
  const missingTemplate: Design = { format: 1, assembly, locks, status: 'draft' };
  // @ts-expect-error only draft and published are persisted states
  const invalidStatus: Design = { format: 1, template: 'ar', assembly, locks, status: 'archived' };
  // @ts-expect-error anchor frames require both orientation directions
  const incompleteFrame: AnchorFrame = { position: [0, 0, 0] };
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
  expectTypeOf(publishedWithIssues).toMatchTypeOf<DesignLoadResult>();

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
  const effectiveLocks: EffectiveSuggestionLocks = { params: { magazine: ['length'] }, optionalParts: ['sight'] };
  const suggestions: SuggestionResult = { variants: [{ ...validDesign, status: 'draft' }], exhausted: false };

  expectTypeOf<Design['format']>().toEqualTypeOf<1>();
  expectTypeOf<Design['status']>().toEqualTypeOf<'draft' | 'published'>();
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
  expectTypeOf(cleanLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(draftLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(failedLoad).toMatchTypeOf<DesignLoadResult>();
  expectTypeOf(effectiveLocks).toMatchTypeOf<EffectiveSuggestionLocks>();
  expectTypeOf<(typeof suggestions.variants)[number]['status']>().toEqualTypeOf<'draft'>();
});
