import type { GuidanceDef, GuidanceGate, HandlingFact } from '@skelly/engine/content';

export const handlingTracksFixture = (): GuidanceDef['handling'] => {
  const facts: HandlingFact[] = ['unpack', 'wield', 'inspect', 'partial', 'ready', 'reload', 'sighted', 'unload'];
  return (['revolver', 'pump'] as const).map((mechanism) => ({
    id: mechanism,
    mechanism,
    reloadRequiresCaseRemoval: mechanism === 'revolver',
    lessons: facts.map((fact) => ({ id: fact, facts: [fact] })),
  }));
};

export const guidanceFixture = (light: string): GuidanceDef => {
  const gate = (all: string[] = [], none: string[] = []): GuidanceGate => ({ all, none });
  const rule = (id: string, when: GuidanceDef['rules'][number]['when'], enabled = gate(), at: string[] = []) => ({
    id,
    when,
    enabled,
    at,
  });
  const step = (id: string, complete: GuidanceGate, enabled = gate()): GuidanceDef['steps'][number] => ({
    id,
    complete,
    enabled,
    topics: [],
    hints: [{ when: {}, parts: [] }],
    notes: [],
  });
  const never = { ...gate(), any: [] };
  return {
    observe: { door: 'fixture_door', searched: 'fixture_box', hands: ['canned_beans', 'can_opener'], light },
    rules: [
      rule('move', { kind: 'displacement', blocks: 6 }),
      rule('look', { kind: 'turn', radians: 0.25 }),
      rule('door', { kind: 'door' }),
      rule('loot', { kind: 'loot' }),
      rule('hands', { kind: 'hands' }),
      rule('opened', { kind: 'opened', item: 'canned_beans' }),
      rule('eaten', { kind: 'consumed', item: 'beans' }),
      rule('drunk', { kind: 'consumed', item: 'water_bottle' }),
      rule('light', { kind: 'light-cycle' }),
      rule('escape', { kind: 'area' }),
      rule('crouch', { kind: 'crouch' }),
      rule('paused', { kind: 'pause' }, gate(), ['pause']),
      rule('light-on', { kind: 'lit', item: light }, gate(['light-choice'])),
      rule('light-swap', { kind: 'battery-swapped', item: light }, gate(['light-choice'])),
      rule('light-relight', { kind: 'lit', item: light }, gate(['light-choice', 'light-swap'])),
    ],
    handling: handlingTracksFixture(),
    steps: [
      step('move', gate(['move', 'look'])),
      step('door', gate(['door'])),
      step('loot', gate(['loot'])),
      step('hands', { ...gate(), any: ['hands', 'opened'] }),
      step('open', gate(['opened'])),
      step('eat', gate(['eaten'])),
      step('drink', gate(['drunk'])),
      step('light', gate(['light'])),
      step('escape', gate(['escape', 'crouch'])),
      step('pause', gate(['paused'])),
      ...['light-on', 'light-swap', 'light-relight'].map((id) => step(id, gate([id]), gate(['light-choice']))),
      step('finish', never, gate([], ['weapons'])),
      step('revolver', { ...gate(), handling: 'revolver' }),
      step('pump', { ...gate(), handling: 'pump' }),
      step('complete', never),
    ],
    choices: [
      { id: 'weapons', at: ['finish'], once: true, label: 'Fixture handling' },
      { id: 'light-choice', at: ['finish', 'complete'], once: true, label: 'Fixture light' },
    ],
    chrome: {
      inventory: 'Inventory',
      closeInventory: 'Close',
      wieldSelectedItem: 'Wield',
      unsaved: 'Unsaved',
      controls: 'Controls',
      restart: 'Restart',
    },
  };
};
