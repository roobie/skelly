import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('F9 main menu project link', () => {
  it('links to the repository home', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('href="https://github.com/roobie/skelly"');
  });
});
