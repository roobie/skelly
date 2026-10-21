import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { expectTypeOf, it } from 'vitest';
import type {
  ExportGlb,
  ExportPortMetadata,
  GlbExportInput,
  GlbExportResult,
  Palette,
  SrgbColor,
} from '../src/exportTypes.ts';

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
