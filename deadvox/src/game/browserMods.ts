import { type ContentIssue, type ContentSource, validateContent } from '../core/content.ts';
import { buildBundledContent, type StartupContent } from './bundledContent.ts';

export const MAX_MOD_BYTES = 1024 * 1024;

export interface BrowserMod {
  source: string;
  text: string;
  enabled: boolean;
}

export interface ModEvaluation {
  content: StartupContent;
  issues: ReadonlyMap<string, readonly ContentIssue[]>;
  canStart: boolean;
}

type IdentifiedSource = ContentSource & { id: string };

const readMod = (mod: BrowserMod): IdentifiedSource | ContentIssue => {
  if (new TextEncoder().encode(mod.text).byteLength > MAX_MOD_BYTES) {
    return { source: mod.source, path: '', message: `File exceeds ${MAX_MOD_BYTES} bytes` };
  }
  try {
    const parsed: unknown = JSON.parse(mod.text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { source: mod.source, path: '', message: 'Expected a mod object' };
    }
    const { id, ...data } = parsed as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim()) {
      return { source: mod.source, path: 'id', message: 'Mod id required: non-empty string' };
    }
    return { source: mod.source, id, data };
  } catch (error) {
    return { source: mod.source, path: '', message: error instanceof Error ? error.message : String(error) };
  }
};

export const evaluateMods = (mods: readonly BrowserMod[]): ModEvaluation => {
  const issues = new Map<string, ContentIssue[]>();
  const selected: ContentSource[] = [];
  const disabled: IdentifiedSource[] = [];
  const identities = new Map<string, string>();
  const duplicateIssue = (source: IdentifiedSource): ContentIssue => ({
    source: source.source,
    path: 'id',
    message: `Duplicate mod id "${source.id}"; already selected in ${identities.get(source.id)}`,
  });
  for (const mod of mods) {
    const parsed = readMod(mod);
    if (!('data' in parsed)) {
      issues.set(mod.source, [parsed]);
      continue;
    }
    const invalid = validateContent(parsed);
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
  const content = buildBundledContent(selected);
  for (const issue of content.issues) {
    const list = issues.get(issue.source) ?? [];
    list.push(issue);
    issues.set(issue.source, list);
  }
  // Disabled files get feedback without supplying dependencies to selected files.
  const previewDisabled = (source: IdentifiedSource) => {
    if (identities.has(source.id)) {
      issues.set(source.source, [duplicateIssue(source)]);
      return;
    }
    const preview = buildBundledContent([...selected, source]);
    issues.set(
      source.source,
      preview.issues.filter((issue) => issue.source === source.source),
    );
  };
  for (const source of disabled) {
    previewDisabled(source);
  }
  return {
    content,
    issues,
    canStart: content.issues.length === 0 && mods.every((mod) => !(mod.enabled && issues.get(mod.source)?.length)),
  };
};
