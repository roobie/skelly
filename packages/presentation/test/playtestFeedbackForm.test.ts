import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { PLAYTEST_FEEDBACK_FIELD_IDS } from '../src/ui/errorReport.ts';

interface IssueForm {
  readonly body: readonly { readonly id?: string }[];
}

const formUrl = new URL('../../../.github/ISSUE_TEMPLATE/playtest-feedback.yml', import.meta.url);

describe('playtest feedback form', () => {
  it('uses the field ids the game prefills', async () => {
    const form = parse(await readFile(formUrl, 'utf8')) as IssueForm;
    const ids = form.body.flatMap(({ id }) => (id === undefined ? [] : [id]));
    expect(ids).toEqual(Object.values(PLAYTEST_FEEDBACK_FIELD_IDS));
  });
});
