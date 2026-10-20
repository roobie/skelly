import type { ContentIssue } from '../../core/content.ts';

export class ModLoadError extends Error {
  readonly issue: ContentIssue;
  constructor(issue: ContentIssue) {
    super(`${issue.source}:${issue.path}: ${issue.message}`);
    this.issue = issue;
  }
}
