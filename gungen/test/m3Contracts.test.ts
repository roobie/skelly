import type { AnchorFrame } from '@skelly/engine/assembly/anchors.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import type { GlbExportInput } from '@skelly/engine/export/exportTypes.ts';
import { expectTypeOf, it } from 'vitest';
import type {
  AnchorSelectionError,
  GunAnchorDeclarations,
  GunAnchorName,
  GunAnchorSelectionPolicy,
  SelectedAnchors,
  SelectGunAnchors,
} from '../src/gun/anchors.ts';
import type { PrefabCatalogueEntry } from '../src/gun/prefabs.ts';

it('pins the gun-facing anchor selection and keeps gun registries out of the exporter', () => {
  const frame: AnchorFrame = { position: [0, 0, 0], forward: [1, 0, 0], up: [0, 1, 0] };
  // @ts-expect-error a selected set must include the winning hold frame
  const selectedWithoutHold: SelectedAnchors = { others: { muzzle: frame } };
  // @ts-expect-error the exporter accepts its explicit core input, not a gun registry
  const gunRegistryAsExportInput: GlbExportInput = {} as GunAnchorDeclarations;
  const selectedAnchors: SelectedAnchors = { hold: frame, others: { support: frame, muzzle: frame } };
  expectTypeOf(selectedWithoutHold).toMatchTypeOf<SelectedAnchors>();
  expectTypeOf(gunRegistryAsExportInput).toMatchTypeOf<GlbExportInput>();
  expectTypeOf(selectedAnchors).toEqualTypeOf<SelectedAnchors>();

  expectTypeOf<keyof PrefabCatalogueEntry>().toEqualTypeOf<'id' | 'version' | 'family' | 'fixedParams'>();
  expectTypeOf<GunAnchorName>().toEqualTypeOf<
    'hold' | 'support' | 'muzzle' | 'ejection' | 'magwell' | 'loading_port'
  >();
  expectTypeOf<Parameters<SelectGunAnchors>>().toEqualTypeOf<
    [resolved: Resolved, declarations: GunAnchorDeclarations, policy: GunAnchorSelectionPolicy]
  >();
  expectTypeOf<ReturnType<SelectGunAnchors>>().toEqualTypeOf<SelectedAnchors | AnchorSelectionError>();
});
