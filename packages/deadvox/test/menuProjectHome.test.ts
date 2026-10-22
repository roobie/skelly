import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REPOSITORY_LINK = /href="https:\/\/github\.com\/[^/"]+\/[^/"]+"/;

describe('F9 main menu project link', () => {
  it('links to a repository home', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toMatch(REPOSITORY_LINK);
  });
});
