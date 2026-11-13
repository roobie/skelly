import { describe, expect, it } from 'vitest';
import { foldText, matchesFind, queryWords } from '../src/ui/inventoryFind.ts';

const find = (query: string, ...texts: string[]) => matchesFind(queryWords(query), texts);

describe('inventory find matcher', () => {
  it('matches everything while the query is empty or blank', () => {
    expect(find('', 'Hammer')).toBe(true);
    expect(find('   ', 'Hammer')).toBe(true);
    expect(find('', 'Hammer', 'tool')).toBe(true);
  });

  it('matches a part of the name', () => {
    expect(find('amm', 'Hammer')).toBe(true);
    expect(find('saw', 'Hammer')).toBe(false);
  });

  it('matches a keyword the name lacks', () => {
    expect(find('tin', 'Can of beans', 'tin')).toBe(true);
    expect(find('tin', 'Can of beans')).toBe(false);
  });

  it('ignores case and accents on both sides', () => {
    expect(find('CAFE', 'Café')).toBe(true);
    expect(find('café', 'cafe')).toBe(true);
    expect(foldText('Éclair')).toBe('eclair');
  });

  it('needs every word to hit, in any order and across name and keywords', () => {
    expect(find('beans tin', 'Can of beans', 'tin')).toBe(true);
    expect(find('tin beans', 'Can of beans', 'tin')).toBe(true);
    expect(find('beans rope', 'Can of beans', 'tin')).toBe(false);
  });
});
