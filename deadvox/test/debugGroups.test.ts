import { describe, expect, it } from 'vitest';
import {
  DEBUG_GROUPS,
  type GroupId,
  keysAtAGlance,
  paramName,
  readClosedGroups,
  writeClosedGroups,
} from '../src/debug/groups.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const broken = {
  getItem(): never {
    throw new Error('storage disabled');
  },
  setItem(): never {
    throw new Error('storage disabled');
  },
};

describe('debug group state', () => {
  it('starts with every group open', () => {
    expect(readClosedGroups(storage())).toEqual(new Set());
  });

  it('remembers the collapsed groups for the next visit, in panel order', () => {
    const store = storage();
    writeClosedGroups(new Set<GroupId>(['post', 'look']), store);
    expect([...store.values.values()]).toEqual(['["look","post"]']);
    expect(readClosedGroups(store)).toEqual(new Set(['look', 'post']));
    writeClosedGroups(new Set(), store);
    expect(readClosedGroups(store)).toEqual(new Set());
  });

  it('opens everything when the stored value is damaged or names unknown groups', () => {
    for (const text of ['', 'nonsense', '{"look":true}', '"look"', '[1, null]']) {
      const store = storage();
      store.setItem('deadvox.debug-groups-closed', text);
      expect(readClosedGroups(store)).toEqual(new Set());
    }
    const store = storage();
    store.setItem('deadvox.debug-groups-closed', '["gone","look"]');
    expect(readClosedGroups(store)).toEqual(new Set(['look']));
  });

  it('defaults to all open and carries on if storage reads or writes fail', () => {
    expect(readClosedGroups(broken)).toEqual(new Set());
    expect(() => writeClosedGroups(new Set<GroupId>(['look']), broken)).not.toThrow();
  });
});

describe('debug group headers', () => {
  it('shows a group its keys, or its hint when it has none', () => {
    const def = (id: GroupId) => DEBUG_GROUPS.find((candidate) => candidate.id === id)!;
    expect(keysAtAGlance(def('look'), [{ key: 'J' }, { key: '-' }, { key: '=' }])).toBe('J · - · =');
    expect(keysAtAGlance(def('share'), [])).toBe('address bar · JSON');
  });

  it('has unique group ids and takes the name out of a parameter hint', () => {
    expect(new Set(DEBUG_GROUPS.map((def) => def.id)).size).toBe(DEBUG_GROUPS.length);
    expect(paramName('bloomclip=1..8')).toBe('bloomclip');
    expect(paramName('cam=x,y,z,yaw,pitch,roll')).toBe('cam');
  });
});
