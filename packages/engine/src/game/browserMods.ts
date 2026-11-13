import { safeParse } from 'valibot';
import { type ContentIssue, validateContent } from '../core/content.ts';
import { admitPacks, type PackInput, PackManifestSchema } from '../core/packAdmission.ts';
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

interface AdmittedFile {
  id: string;
  version: string;
  data: unknown;
  source: string;
}

export interface ModEvaluation {
  content: StartupContent;
  issues: ReadonlyMap<string, readonly ContentIssue[]>;
  canStart: boolean;
  /** The selected single-file mods that admission kept, in admission order. */
  admitted: AdmittedFile[];
  /** Every selected mod that admission kept, in admission order: a folder pack whole, a single-file mod as admitted. */
  admittedInOrder: (AdmittedFile | PackInput)[];
  /** Every pack admission kept, the entry pack's default stack included, in admission order. */
  admittedPacks: readonly PackInput[];
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

export const isFolderPack = (entry: object): entry is PackInput => 'manifest' in entry;

const admittedFile = ({ id, version, manifest, data, source }: IdentifiedSource): AdmittedFile => ({
  id,
  version,
  data: { manifest, content: data },
  source,
});

/**
 * Folder packs go through pack admission whole; only single-file mods are read as mod text. Both load in the order
 * given, so a later default start wins whatever format either mod has.
 */
export const evaluateMods = (intake: ModIntake, entries: readonly (BrowserMod | PackInput)[]): ModEvaluation => {
  const { buildBundledContent, bundledPackInputs } = intake.content;
  const mods = entries.filter((entry): entry is BrowserMod => !isFolderPack(entry));
  const folderPacks = entries.filter(isFolderPack);
  const issues = new Map<string, ContentIssue[]>();
  const selected: IdentifiedSource[] = [];
  const selectedFrom = new Map<BrowserMod, IdentifiedSource>();
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
      selectedFrom.set(mod, parsed);
    }
  }
  const ordered = entries.flatMap((entry): PackInput[] => {
    const pack = isFolderPack(entry) ? entry : selectedFrom.get(entry);
    return pack ? [pack] : [];
  });
  const content = buildBundledContent(ordered, folderPacks.length > 0 || mods.some((mod) => mod.enabled));
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
    const preview = buildBundledContent([...ordered, source]);
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
  const admission = admitPacks([...bundledPackInputs, ...ordered]);
  const admittedInOrder = admission.packs.flatMap((pack): (AdmittedFile | PackInput)[] => {
    if (folderPacks.includes(pack)) {
      return [pack];
    }
    return selected.includes(pack as IdentifiedSource) ? [admittedFile(pack as IdentifiedSource)] : [];
  });
  return {
    content,
    admitted: admittedInOrder.filter((entry): entry is AdmittedFile => !isFolderPack(entry)),
    admittedInOrder,
    admittedPacks: admission.packs,
    issues,
    canStart: content.issues.length === 0 && mods.every((mod) => !(mod.enabled && issues.get(mod.source)?.length)),
  };
};
