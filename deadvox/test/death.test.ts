import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { defOf } from '../src/core/items.ts';
import { type DeathSummary, deathViewModel, lootedText, newWorldQuery } from '../src/ui/death.ts';

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

const displayedMinutes = (span: string): number | undefined => {
  const parts = span.match(/\d+/g)?.map(Number) ?? [];
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  return undefined;
};

describe('deathViewModel', () => {
  it('preserves the elapsed duration and cause in the death view model', () => {
    const death = summary({ cause: 'starvation', survived: 62_640 });
    const vm = deathViewModel(registry, death);
    expect(vm.cause).toBe(death.cause);
    expect(displayedMinutes(vm.span)).toBe(Math.floor(death.survived / 60));
  });

  it('shows a summary without implying any fixture items were taken when none were searched', () => {
    const vm = deathViewModel(registry, summary({ searched: 0 }));
    expect(vm.summary).not.toBe('');
    expect(vm.summary).not.toContain(defOf(registry, 'can_of_beans').name.toLowerCase());
    expect(vm.summary).not.toContain(defOf(registry, 'flashlight').name.toLowerCase());
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
    const searched = 1;
    const vm = deathViewModel(registry, summary({ searched }));
    expect(vm.summary).toContain(String(searched));
    expect(vm.summary).not.toContain(defOf(registry, 'can_of_beans').name.toLowerCase());
    expect(vm.summary).not.toContain(defOf(registry, 'flashlight').name.toLowerCase());
  });
});

describe('lootedText', () => {
  it('lists item names in descending count order', () => {
    const looted = new Map([
      ['flashlight', 1],
      ['can_of_beans', 3],
    ]);
    const text = lootedText(registry, looted);
    expect(text).toContain(String(looted.get('can_of_beans')));
    expect(text).toContain('can of beans');
    expect(text).toContain('flashlight');
    expect(text.indexOf('can of beans')).toBeLessThan(text.indexOf('flashlight'));
  });
});

describe('newWorldQuery', () => {
  it('bumps the seed and drops the start time, keeping other params', () => {
    const query = new URLSearchParams(newWorldQuery('?seed=3&radius=64&time=120', 3));
    expect(query.get('seed')).toBe('4');
    expect(query.get('radius')).toBe('64');
    expect(query.has('time')).toBe(false);
  });
});
