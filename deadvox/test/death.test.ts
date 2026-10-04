import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
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

const SPAN_WITH_HOURS = /^\d+ h \d+ min$/;
const SPAN_WITH_MINUTES = /^\d+ min$/;
const NOTHING_WORD = /nothing/i;

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
    expect(vm.span).toMatch(SPAN_WITH_HOURS);
  });

  it('says nothing was searched when nothing was', () => {
    const vm = deathViewModel(registry, summary({ searched: 0 }));
    expect(vm.summary).toMatch(NOTHING_WORD);
  });

  it('says what was searched and taken, most looted first', () => {
    const looted = new Map([
      ['flashlight', 1],
      ['can_of_beans', 3],
    ]);
    const vm = deathViewModel(registry, summary({ searched: 2, looted }));
    expect(vm.summary).toContain('3');
    expect(vm.summary).toContain('×');
    expect(vm.summary.toLowerCase()).toContain('can of beans');
    expect(vm.summary.toLowerCase()).toContain('flashlight');
    expect(vm.summary.toLowerCase().indexOf('can of beans')).toBeLessThan(
      vm.summary.toLowerCase().indexOf('flashlight'),
    );
  });

  it('says containers were searched but nothing taken', () => {
    const vm = deathViewModel(registry, summary({ searched: 1 }));
    expect(vm.summary).toMatch(NOTHING_WORD);
    expect(vm.summary.toLowerCase()).not.toContain('can of beans');
    expect(vm.summary.toLowerCase()).not.toContain('flashlight');
  });
});

describe('formatSpan', () => {
  it('formats under an hour as minutes only', () => {
    expect(formatSpan(40 * 60)).toMatch(SPAN_WITH_MINUTES);
  });

  it('formats an hour or more as hours and minutes', () => {
    expect(formatSpan(62_640)).toMatch(SPAN_WITH_HOURS);
  });
});

describe('lootedText', () => {
  it('lists counted items with ×, singles without, most first', () => {
    const looted = new Map([
      ['flashlight', 1],
      ['can_of_beans', 3],
    ]);
    const text = lootedText(registry, looted);
    expect(text).toContain('3');
    expect(text).toContain('×');
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
