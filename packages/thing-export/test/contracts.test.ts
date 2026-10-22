import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { NeutralModelSchema } from '@skelly/thing-core/schema';
import { safeParse } from 'valibot';
import { expect, expectTypeOf, it } from 'vitest';
import type {
  ExportGlb,
  ExportPortMetadata,
  GlbExportInput,
  GlbExportResult,
  Palette,
  SrgbColor,
} from '../src/exportTypes.ts';

// Type-level only: the assertions are checked by the typecheck, so the runtime test cannot fail.
it('owns the geometry writer and caller-supplied export identity contracts', () => {
  const palette: Palette = {
    familyColors: {},
    specialColors: {},
    fallbackColor: [0.5, 0.5, 0.5],
    fallbackFinish: { metallic: 0, roughness: 0.5 },
  };
  const input: GlbExportInput = {
    resolved: {} as Resolved,
    palette,
    asset: { id: 'fixture', file: 'assets/models/fixture.glb' },
  };
  const success: GlbExportResult = { ok: true, glb: new Uint8Array() };
  const failure: GlbExportResult = { ok: false, error: { code: 'unplaced-parts', partIds: ['fixture'] } };
  expectTypeOf<Parameters<ExportGlb>>().toEqualTypeOf<[input: GlbExportInput]>();
  expectTypeOf<ReturnType<ExportGlb>>().toEqualTypeOf<GlbExportResult>();
  expectTypeOf(input).toMatchTypeOf<GlbExportInput>();
  expectTypeOf(success).toMatchTypeOf<GlbExportResult>();
  expectTypeOf(failure).toMatchTypeOf<GlbExportResult>();
  expectTypeOf<Palette['familyColors']>().toEqualTypeOf<Readonly<Record<string, SrgbColor>>>();
  expectTypeOf<ExportPortMetadata['id']>().toEqualTypeOf<`${string}.${string}`>();
});

it('emits a multi-part export that the runtime model schema accepts and constrains', () => {
  const box = { min: [0, 0, 0], max: [1, 1, 1] };
  const parts = {
    base: { node: 'base:instance', massKg: 2, centreOfMass: [0, 0, 0], collision: [box] },
    child: { node: 'child:instance', massKg: 0.5, centreOfMass: [0.5, 1, 0] },
  };
  const exported = { id: 'fixture', file: 'assets/models/fixture.glb', parts };
  const issues = (value: unknown) => safeParse(NeutralModelSchema, value).issues ?? [];
  expect(issues(exported)).toEqual([]);
  expect(issues({ ...exported, parts: { ...parts, child: { ...parts.child, massKg: -1 } } })).not.toEqual([]);
  expect(issues({ ...exported, parts: {} })).not.toEqual([]);
});
