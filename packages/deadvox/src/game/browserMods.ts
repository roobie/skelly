import { safeParse } from 'valibot';
import { type ContentIssue, validateContent } from '../../../engine/src/core/content.ts';
import { admitWithFolderPacks, type PackInput, PackManifestSchema } from '../../../engine/src/core/packAdmission.ts';
import type { BundledContent, StartupContent } from './bundledContent.ts';
import type { BundledMod } from './bundledMods.ts';

/** What mod admission reads from the product: its shipped content, its bundled mods and its mod file bound. */
export interface ModIntake {
  readonly content: BundledContent;
  readonly bundledMods: readonly BundledMod[];
  readonly maxModBytes: number;
}

export interface BrowserMod {
  source: string;
  text: string;
  enabled: boolean;
}

export interface ModEvaluation {
  content: StartupContent;
  issues: ReadonlyMap<string, readonly ContentIssue[]>;
  canStart: boolean;
  admitted: { id: string; version: string; data: unknown }[];
  /** The selected folder packs that admission kept, in admission order. */
  admittedFolderPacks: PackInput[];
}

type IdentifiedSource = PackInput & { id: string; version: string; data: unknown };

const readMod = (mod: BrowserMod, maxModBytes: number): IdentifiedSource | ContentIssue => {
  if (new TextEncoder().encode(mod.text).byteLength > maxModBytes) {
    return { source: mod.source, path: '', message: `File exceeds ${maxModBytes} bytes` };
  }
  try {
    const parsed: unknown = JSON.parse(mod.text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { source: mod.source, path: '', message: 'Expected a mod object' };
    }
    const { id, version, tier, product, defaultStart, dependencies, overrides, ...data } = parsed as Record<
      string,
      unknown
    >;
    if (typeof id !== 'string' || !id.trim()) {
      return { source: mod.source, path: 'id', message: 'Mod id required: non-empty string' };
    }
    if (typeof version !== 'string' || !version.trim()) {
      return { source: mod.source, path: 'version', message: 'Mod version must be a non-empty string' };
    }
    const manifest = safeParse(PackManifestSchema, {
      id,
      version,
      tier,
      product,
      ...(defaultStart === undefined ? {} : { defaultStart }),
      dependencies,
      overrides,
      files: [{ path: 'content.json', kind: 'content' }],
    });
    if (!manifest.success) {
      return {
        source: mod.source,
        path: 'manifest',
        message: manifest.issues.map(({ message }) => message).join('; '),
      };
    }
    return {
      source: mod.source,
      id,
      version,
      data,
      manifest: manifest.output,
      files: [{ source: 'content.json', data }],
    };
  } catch (error) {
    return { source: mod.source, path: '', message: error instanceof Error ? error.message : String(error) };
  }
};

/** Folder packs go through pack admission whole; only single-file mods are read as mod text. */
export const evaluateMods = (
  intake: ModIntake,
  mods: readonly BrowserMod[],
  folderPacks: readonly PackInput[] = [],
): ModEvaluation => {
  const { buildBundledContent, bundledPackInputs } = intake.content;
  const issues = new Map<string, ContentIssue[]>();
  const selected: IdentifiedSource[] = [];
  const disabled: IdentifiedSource[] = [];
  const identities = new Map<string, string>();
  const duplicateIssue = (source: IdentifiedSource): ContentIssue => ({
    source: source.source,
    path: 'id',
    message: `Duplicate mod id "${source.id}"; already selected in ${identities.get(source.id)}`,
  });
  for (const mod of mods) {
    const parsed = readMod(mod, intake.maxModBytes);
    if (!('data' in parsed)) {
      issues.set(mod.source, [parsed]);
      continue;
    }
    const invalid = validateContent({ source: parsed.source, data: parsed.data });
    if (invalid.length > 0) {
      issues.set(mod.source, invalid);
    } else if (!mod.enabled) {
      disabled.push(parsed);
    } else if (identities.has(parsed.id)) {
      issues.set(mod.source, [duplicateIssue(parsed)]);
    } else {
      identities.set(parsed.id, parsed.source);
      selected.push(parsed);
    }
  }
  const content = buildBundledContent(
    [...folderPacks, ...selected],
    folderPacks.length > 0 || mods.some((mod) => mod.enabled),
  );
  const owningSource = (source: string) =>
    selected.find((pack) => source === `${pack.source}/content.json`)?.source ?? source;
  for (const issue of content.issues) {
    const source = owningSource(issue.source);
    const list = issues.get(source) ?? [];
    list.push({ ...issue, source });
    issues.set(source, list);
  }
  // Disabled files get feedback without supplying dependencies to selected files.
  const previewDisabled = (source: IdentifiedSource) => {
    if (identities.has(source.id)) {
      issues.set(source.source, [duplicateIssue(source)]);
      return;
    }
    const preview = buildBundledContent([...folderPacks, ...selected, source]);
    issues.set(
      source.source,
      preview.issues.filter(
        (issue) => issue.source === source.source || issue.source === `${source.source}/content.json`,
      ),
    );
  };
  for (const source of disabled) {
    previewDisabled(source);
  }
  const admission = admitWithFolderPacks(bundledPackInputs, folderPacks, selected);
  return {
    content,
    admitted: admission.packs
      .filter((pack): pack is IdentifiedSource => selected.includes(pack as IdentifiedSource))
      .map(({ id, version, manifest, data }) => ({ id, version, data: { manifest, content: data } })),
    admittedFolderPacks: admission.folderPacks,
    issues,
    canStart: content.issues.length === 0 && mods.every((mod) => !(mod.enabled && issues.get(mod.source)?.length)),
  };
};
