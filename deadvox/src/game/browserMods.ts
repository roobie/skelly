import type { ContentIssue, ContentSource } from '../core/content.ts';
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

const readMod = (mod: BrowserMod): ContentSource | ContentIssue => {
  if (new TextEncoder().encode(mod.text).byteLength > MAX_MOD_BYTES) {
    return { source: mod.source, path: '', message: `File exceeds ${MAX_MOD_BYTES} bytes` };
  }
  try {
    return { source: mod.source, data: JSON.parse(mod.text) };
  } catch (error) {
    return { source: mod.source, path: '', message: error instanceof Error ? error.message : String(error) };
  }
};

export const evaluateMods = (mods: readonly BrowserMod[]): ModEvaluation => {
  const issues = new Map<string, ContentIssue[]>();
  const selected: ContentSource[] = [];
  const disabled: ContentSource[] = [];
  for (const mod of mods) {
    const parsed = readMod(mod);
    if ('data' in parsed) {
      (mod.enabled ? selected : disabled).push(parsed);
    } else {
      issues.set(mod.source, [parsed]);
    }
  }
  const content = buildBundledContent(selected);
  for (const issue of content.issues) {
    const list = issues.get(issue.source) ?? [];
    list.push(issue);
    issues.set(issue.source, list);
  }
  // Disabled files get feedback without supplying dependencies to selected files.
  for (const source of disabled) {
    const preview = buildBundledContent([...selected, source]);
    issues.set(
      source.source,
      preview.issues.filter((issue) => issue.source === source.source),
    );
  }
  return {
    content,
    issues,
    canStart: content.issues.length === 0 && mods.every((mod) => !(mod.enabled && issues.get(mod.source)?.length)),
  };
};
