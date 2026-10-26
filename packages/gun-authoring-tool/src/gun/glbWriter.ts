import type { GlbExportInput, GlbExportResult } from '@skelly/thing-export/exportTypes.ts';
import { exportGlb } from '@skelly/thing-export/glb.ts';

const GUN_GENERATOR = 'skelly gungen glb export';

/** Supplies Gungen's persisted GLB identity to the domain-neutral geometry writer. */
export const exportGunGeometry = (input: Omit<GlbExportInput, 'generator' | 'metadataNamespace'>): GlbExportResult =>
  exportGlb({ ...input, generator: GUN_GENERATOR, metadataNamespace: 'gungen' });
