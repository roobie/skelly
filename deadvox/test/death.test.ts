import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { defOf } from '../src/core/items.ts';
import { type DeathSummary, deathViewModel, formatSpan, lootedText, newWorldQuery } from '../src/ui/death.ts';

const { registry } = buildRegistry([
  {
    source: 'fixture.json',
    data: {
      items: [
        { id: 'can_of_beans', name: 'Can of beans', category: 'food', weight: 400, size: [1, 1] },
        { id: 'flashlight', name: 'Flashlight', category: 'tool', weight: 200, size: [1, 1] },
      ],
    },
  },
]);

const summary = (partial: Partial<DeathSummary>): DeathSummary => ({
  cause: 'a zombie',
  survived: 0,
  looted: new Map(),
  searched: 0,
  ...partial,
});

describe('deathViewModel', () => {
  it('shows the cause and the time survived', () => {
    const vm = deathViewModel(registry, summary({ cause: 'starvation', survived: 62_640 }));
    expect(vm.cause).toBe('starvation');
    expect(vm.span.match(/\d+/g)).toEqual(['17', '24']);
  });

  it('says nothing was searched when nothing was', () => {
    const vm = deathViewModel(registry, summary({ searched: 0 }));
    expect(vm.summary.match(/\d+/g)).toBeNull();
  });

  it('says what was searched and taken, most looted first', () => {
    const looted = new Map([
      ['flashlight', 1],
      ['can_of_beans', 3],
    ]);
    const searched = 2;
    const vm = deathViewModel(registry, summary({ searched, looted }));
    expect(vm.summary).toContain(String(searched));
    expect(vm.summary).toContain(lootedText(registry, looted));
  });

  it('says containers were searched but nothing taken', () => {
    const vm = deathViewModel(registry, summary({ searched: 1 }));
    expect(vm.summary).toContain('1');
    expect(vm.summary).not.toContain(defOf(registry, 'can_of_beans').name.toLowerCase());
    expect(vm.summary).not.toContain(defOf(registry, 'flashlight').name.toLowerCase());
  });
});

describe('formatSpan', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatSpan(40 * 60).match(/\d+/g)).toEqual(['40']);
  });

  it('formats an hour or more as hours and minutes', () => {
    expect(formatSpan(62_640).match(/\d+/g)).toEqual(['17', '24']);
  });
});

describe('lootedText', () => {
  it('lists item names in descending count order', () => {
    const looted = new Map([
      ['flashlight', 1],
      ['can_of_beans', 3],
    ]);
    const text = lootedText(registry, looted);
    expect(text).toContain('3');
    expect(text).toContain('can of beans');
    expect(text).toContain('flashlight');
    expect(text.indexOf('can of beans')).toBeLessThan(text.indexOf('flashlight'));
  });
});

describe('newWorldQuery', () => {
  it('bumps the seed and drops the start time, keeping other params', () => {
    expect(newWorldQuery('?seed=3&radius=64&time=120', 3)).toBe('?seed=4&radius=64');
  });
});
