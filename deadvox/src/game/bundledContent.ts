import { BundleAdmission, type BundleStamp } from '../core/bundleAdmission.ts';
import { buildRegistry, type ContentSource } from '../core/content.ts';

declare const __DEADVOX_BUNDLE_STAMP__: BundleStamp | undefined;
declare const __DEADVOX_ADMISSION_FINGERPRINT__: string | undefined;

const files = import.meta.glob<unknown>('../content/base/*.json', { eager: true, import: 'default' });
const sources: ContentSource[] = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([source, data]) => ({ source, data }));

export const baseSources: readonly ContentSource[] = sources;

export type StartupContent = ReturnType<typeof buildRegistry>;

const bundle = await BundleAdmission.prepare(sources, __DEADVOX_BUNDLE_STAMP__, __DEADVOX_ADMISSION_FINGERPRINT__);

export const buildBundledContent = (
  mods: readonly ContentSource[] = [],
  modsSelected = mods.length > 0,
): StartupContent => buildRegistry([...sources, ...mods], { bundle, modsSelected });
