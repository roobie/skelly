import type { ContentIssue } from '../../deadvox/src/core/content.ts';

/** Formats build-registry issues, including ones whose source was dropped from the registry. */
export const registryIssueText = (issues: readonly ContentIssue[]): string =>
  issues.map(({ source, path, message }) => `${source}: ${path}: ${message}`).join('\n');
