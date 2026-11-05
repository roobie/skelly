import type { ContentIssue } from '../../src/core/content.ts';

type Owner = 'sound selection' | 'scenario starts' | 'core extraction' | 'theme extraction';
interface KnownIssue {
  owner: Owner;
  issue: ContentIssue;
}
const known = (owner: Owner, source: string, path: string, message: string): KnownIssue => ({
  owner,
  issue: { source, path, message },
});
const missing = (owner: Owner, section: string, capability: string): KnownIssue =>
  known(owner, 'core content', section, `missing required capability "${capability}"`);

// #1532 removes this exact ledger; it must not derive expectations from the validator's dispatch tables.
export const CORE_ONLY_KNOWN_ISSUES: readonly KnownIssue[] = [
  missing('scenario starts', 'siteGeneration', 'authoredSite'),
];
