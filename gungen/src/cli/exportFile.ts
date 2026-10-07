import type { AppearanceContext, GlbAssetIdentity } from '../core/design.ts';
import { parseAssemblyJson } from '../core/parseAssembly.ts';
import type { Assembly } from '../core/schema.ts';
import { loadGunDesign } from '../gun/designLoader.ts';
import { exportGunGlb, type GunDeadvoxModelEntry, type GunExportMetadata } from '../gun/exportGlb.ts';
import { TEMPLATES } from '../gun/templates.ts';
import { readCartridge } from './readCartridge.ts';

/** Canonical fixture identities supply appearance independently from their mechanical templates. */
const FIXTURE_APPEARANCE: Readonly<Record<string, AppearanceContext>> = {
  'archetype-ak': { variant: 'ak' },
  'archetype-ar': { variant: 'ar' },
  'archetype-ar-free-float': { variant: 'ar-free-float' },
  'archetype-awm': { variant: 'awm' },
  'archetype-battle-rifle': { variant: 'battle-rifle' },
  'archetype-bolt-rifle': { variant: 'bolt-rifle' },
  'archetype-bolt-rifle-box': { variant: 'bolt-rifle-box' },
  'archetype-bullpup': { variant: 'bullpup' },
  'archetype-pistol': { variant: 'pistol' },
  'archetype-pump-shotgun': { variant: 'pump-shotgun' },
  'archetype-revolver': { variant: 'revolver' },
  'archetype-smg': { variant: 'smg' },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const generatedAppearance = (
  raw: unknown,
): { readonly ok: true; readonly context?: AppearanceContext } | { readonly ok: false; readonly message: string } => {
  if (!(isRecord(raw) && Object.hasOwn(raw, 'appearance'))) {
    return { ok: true };
  }
  const value = raw.appearance;
  if (!isRecord(value)) {
    return { ok: false, message: 'appearance: expected an object' };
  }
  const { variant, finish } = value;
  if (variant !== undefined && typeof variant !== 'string') {
    return { ok: false, message: 'appearance.variant: expected a string' };
  }
  if (
    finish !== undefined &&
    (!isRecord(finish) || Object.values(finish).some((material) => typeof material !== 'string'))
  ) {
    return { ok: false, message: 'appearance.finish: expected a map of material ids' };
  }
  return {
    ok: true,
    context: {
      ...(variant === undefined ? {} : { variant }),
      ...(finish === undefined ? {} : { finish: finish as Record<string, string> }),
    },
  };
};

export type ExportFileResult =
  | {
      readonly ok: true;
      readonly glb: Uint8Array;
      readonly modelEntry: GunDeadvoxModelEntry;
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

type ReadAssemblyResult =
  | { assembly: Assembly; warnings: string[]; appearance: AppearanceContext; calibre?: string }
  | { message: string };

const readDesignAssembly = (text: string): ReadAssemblyResult => {
  const loaded = loadGunDesign(text);
  if (!loaded.ok) {
    return { message: `${loaded.error.code}: ${loaded.error.message}` };
  }
  const template = TEMPLATES.find(({ name }) => name === loaded.design.template);
  const calibrePaths = new Set(
    (template?.calibreParams ?? []).map(({ slot, param }) => `assembly.parts.${slot}.params.${param}`),
  );
  const calibreIssue = loaded.issues.find(
    (issue) => issue.path === 'calibre' || (issue.path !== undefined && calibrePaths.has(issue.path)),
  );
  if (calibreIssue) {
    return { message: `design issue (template-choice): ${calibreIssue.message}` };
  }
  return {
    assembly: loaded.design.assembly,
    warnings: loaded.issues.map((issue) => `design issue (${issue.code}): ${issue.message}`),
    ...(loaded.design.calibre === undefined ? {} : { calibre: loaded.design.calibre }),
    appearance: {
      variant: loaded.design.template,
      ...(loaded.design.finish ? { finish: loaded.design.finish } : {}),
    },
  };
};

const readFixtureAssembly = (text: string, raw: unknown): ReadAssemblyResult => {
  const parsed = parseAssemblyJson(text);
  if (!parsed.ok) {
    return { message: `${parsed.error.path}: ${parsed.error.message}` };
  }
  const metadata = generatedAppearance(raw);
  if (!metadata.ok) {
    return { message: metadata.message };
  }
  const calibre = isRecord(raw) ? raw.calibre : undefined;
  if (calibre !== undefined && (typeof calibre !== 'string' || calibre.trim() === '')) {
    return { message: 'calibre: expected a non-empty cartridge id' };
  }
  return {
    assembly: parsed.assembly,
    warnings: [],
    appearance: metadata.context ?? FIXTURE_APPEARANCE[parsed.assembly.name] ?? {},
    ...(calibre === undefined ? {} : { calibre }),
  };
};

/** A design file has a `format`; anything else is read as a bare assembly (a fixture). */
const readAssembly = (text: string): ReadAssemblyResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { message: `invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  return isRecord(raw) && 'format' in raw ? readDesignAssembly(text) : readFixtureAssembly(text, raw);
};

/** Turns a design or fixture file's text into the `.glb` bytes and the deadvox model entry. */
export const exportFileText = (
  text: string,
  asset: GlbAssetIdentity,
  metadata: GunExportMetadata = {},
): ExportFileResult => {
  const read = readAssembly(text);
  if ('message' in read) {
    return { ok: false, message: read.message };
  }
  if (read.calibre !== undefined && metadata.cartridge !== undefined && metadata.cartridge.id !== read.calibre) {
    return {
      ok: false,
      message: `design calibre ${JSON.stringify(read.calibre)} does not match supplied cartridge ${JSON.stringify(metadata.cartridge.id)}`,
    };
  }
  const cartridgeResult = readCartridge(read.calibre);
  if (!cartridgeResult.ok) {
    return { ok: false, message: `calibre: ${cartridgeResult.message}` };
  }
  const exportMetadata =
    metadata.cartridge || !cartridgeResult.cartridge ? metadata : { ...metadata, cartridge: cartridgeResult.cartridge };
  const result = exportGunGlb(read.assembly, asset, read.appearance, {
    ...exportMetadata,
    includeAttachmentCompatibility: true,
  });
  if (!result.ok) {
    return { ok: false, message: `export refused: ${JSON.stringify(result.error)}` };
  }
  return { ok: true, glb: result.glb, modelEntry: result.modelEntry, warnings: read.warnings };
};
