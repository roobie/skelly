import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const iconPath = 'public/favicon.svg';
const ICON_LINK = /<link rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg" \/>/;
const SVG_ROOT = /<svg\s[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/;

describe('generated page favicon', () => {
  it.each(['index.html', 'sounds.html'])('%s links the SVG icon', (page) => {
    expect(readFileSync(page, 'utf8')).toMatch(ICON_LINK);
  });

  it('has a small, local SVG source file', () => {
    expect(existsSync(iconPath)).toBe(true);
    if (!existsSync(iconPath)) {
      return;
    }
    expect(statSync(iconPath).size).toBeLessThan(1024);
    expect(readFileSync(iconPath, 'utf8')).toMatch(SVG_ROOT);
  });
});
