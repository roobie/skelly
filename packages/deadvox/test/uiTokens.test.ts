// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import baseUi from '../src/content/base/ui.json' with { type: 'json' };
import { buildRegistry, requiredContentIssues, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CORE_LABEL_SLOTS, CORE_MESSAGE_SLOTS } from '../src/core/coreText.ts';
import { applyUiTokens } from '../src/ui/uiTokens.ts';

const refusalSound = {
  id: 'player_nope',
  description: 'fixture refusal',
  variants: ['assets/audio/nope.ogg'],
  gain: 0.5,
  pitchJitter: [1, 1],
  gainJitter: [1, 1],
  minIntervalSimSeconds: 0.75,
  category: 'body',
  noise: { enabled: false, radiusMetres: 1 },
};
const slottedFixture = (slots: Readonly<Record<string, readonly string[]>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(slots).map(([key, names]) => [
      key,
      [`fixture ${key}`, ...names.map((name) => `{${name}}`)].join(' '),
    ]),
  );
const coreMessages = slottedFixture(CORE_MESSAGE_SLOTS);
const wearSlotLabels = Object.fromEntries(
  ['head', 'eyes', 'torso', 'vest', 'legs', 'back', 'waist', 'hands', 'feet', 'shoulder'].map((slot) => [
    slot,
    `fixture ${slot}`,
  ]),
);
interface TextTable {
  [key: string]: string | TextTable;
}
const PLACEHOLDER = /\{\w+\}/;
/** Base content's action text: its placeholders are what validation checks, so a fixture copy would only drift. */
const baseActionText = baseUi.ui[0]!.actionText as TextTable;
const tuning = {
  id: CORE_CONTENT_IDS.coreUi,
  spacing: 1,
  hudScale: 1,
  furnitureRadial: baseUi.ui[0]!.furnitureRadial,
  refusalSound: refusalSound.id,
  audioVolumes: { master: 0.5, world: 0.5, body: 0.5, ui: 0.5 },
  restLabels: { rest: 'fixture rest', sleep: 'fixture sleep' },
  doorCloseBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
  actionText: baseActionText,
  coreMessages,
  coreActionLabels: slottedFixture(CORE_LABEL_SLOTS),
  wearSlotLabels,
  screenText: baseUi.ui[0]!.screenText,
  furnitureMoveMessages: Object.fromEntries(
    [
      'tooBig',
      'carryInstead',
      'floorOnly',
      'slideTired',
      'fastened',
      'handsFull',
      'tired',
      'standingOn',
      'someoneOnIt',
      'holdsUp',
      'holdsItems',
      'barricaded',
      'reserved',
      'fallsOnPlayer',
      'fallsOnOther',
      'nowhereToLand',
      'noRoom',
      'playerInWay',
      'otherInWay',
      'coversHatch',
      'hatchCovered',
      'blocksLadder',
      'outOfReach',
      'wornOut',
      'emptyHands',
      'staysUpright',
    ].map((key) => [key, `fixture ${key}`]),
  ),
};

it('applies validated core-mod UI tuning to document-root CSS properties', () => {
  const { registry, issues } = buildRegistry([
    { source: 'ui-fixture.json', data: { ui: [{ ...tuning, spacing: 0.75, hudScale: 1.25 }] } },
    { source: 'ui-sounds.json', data: { sounds: [refusalSound] } },
  ]);
  expect(issues).toEqual([]);

  const root = document.createElement('html');
  applyUiTokens(registry, root);

  expect(root.style.getPropertyValue('--ui-spacing')).toBe('0.75');
  expect(root.style.getPropertyValue('--ui-scale')).toBe('1.25');
});

it('rejects non-positive UI spacing and scale', () => {
  const issues = validateContent({
    source: 'invalid-ui-fixture.json',
    data: { ui: [{ ...tuning, spacing: 0, hudScale: 0 }] },
  });
  expect(issues.map(({ path }) => path)).toEqual(['ui[0].spacing', 'ui[0].hudScale']);
});

it('rejects UI tuning without a refusal sound, or whose refusal sound is not loaded', () => {
  const { refusalSound: _, ...withoutSound } = tuning;
  const missing = validateContent({ source: 'no-refusal-sound.json', data: { ui: [withoutSound] } });
  expect(missing.map(({ path }) => path)).toEqual(['ui[0].refusalSound']);

  const { issues } = buildRegistry([{ source: 'dangling-refusal-sound.json', data: { ui: [tuning] } }]);
  expect(issues.map(({ path, message }) => [path, message])).toEqual([
    ['ui[0].refusalSound', `no sound event "${refusalSound.id}"`],
  ]);
});

it('rejects UI tuning missing any player-facing text field, with no code default', () => {
  const {
    restLabels: _r,
    doorCloseBlockedMessages: _d,
    actionText: _actionText,
    coreMessages: _m,
    coreActionLabels: _a,
    wearSlotLabels: _w,
    furnitureMoveMessages: _f,
    screenText: _s,
    ...bare
  } = tuning;
  const missing = validateContent({ source: 'no-text.json', data: { ui: [bare] } });
  expect(missing.map(({ path }) => path)).toEqual([
    'ui[0].screenText',
    'ui[0].restLabels',
    'ui[0].doorCloseBlockedMessages',
    'ui[0].furnitureMoveMessages',
    'ui[0].actionText',
    'ui[0].coreMessages',
    'ui[0].coreActionLabels',
    'ui[0].wearSlotLabels',
  ]);
  const { head: _h, ...partialSlots } = wearSlotLabels;
  const partial = validateContent({
    source: 'partial-slots.json',
    data: { ui: [{ ...tuning, wearSlotLabels: partialSlots }] },
  });
  expect(partial.map(({ path }) => path)).toEqual(['ui[0].wearSlotLabels.head']);
  const { noRoom: _n, ...partialInventory } = tuning.screenText.inventory;
  const partialScreen = validateContent({
    source: 'partial-screen-text.json',
    data: { ui: [{ ...tuning, screenText: { ...tuning.screenText, inventory: partialInventory } }] },
  });
  expect(partialScreen.map(({ path }) => path)).toEqual(['ui[0].screenText.inventory.noRoom']);
});

it('rejects a screen text line that drops a slot its code fills, or names one its code never fills', () => {
  const { options } = tuning.screenText;
  const issues = validateContent({
    source: 'slot-mismatch.json',
    data: {
      ui: [
        {
          ...tuning,
          screenText: {
            ...tuning.screenText,
            options: { ...options, showHud: 'fixture without a key', on: 'fixture {key}' },
          },
        },
      ],
    },
  });
  expect(issues.map(({ path }) => path)).toEqual(['ui[0].screenText.options.showHud', 'ui[0].screenText.options.on']);
});

it('rejects core text missing a key code asks for, so a lost message fails validation, not play', () => {
  const { tooFar: _, ...withoutKey } = coreMessages;
  const missing = validateContent({ source: 'no-key.json', data: { ui: [{ ...tuning, coreMessages: withoutKey }] } });
  expect(missing.map(({ path }) => path)).toEqual(['ui[0].coreMessages.tooFar']);
});

it('rejects a core template that drops or invents a slot', () => {
  const issues = validateContent({
    source: 'bad-slots.json',
    data: { ui: [{ ...tuning, coreMessages: { ...coreMessages, cantUse: 'fixture', tooFar: 'fixture {item}' } }] },
  });
  expect(issues.map(({ path }) => path).sort()).toEqual(['ui[0].coreMessages.cantUse', 'ui[0].coreMessages.tooFar']);
});

const leafPaths = (table: TextTable, prefix: string[] = []): string[][] =>
  Object.entries(table).flatMap(([key, value]) =>
    typeof value === 'string' ? [[...prefix, key]] : leafPaths(value, [...prefix, key]),
  );
const without = (table: TextTable, [head, ...rest]: string[]): TextTable => {
  const { [head!]: value, ...others } = table;
  return rest.length === 0 ? others : { ...others, [head!]: without(value as TextTable, rest) };
};
const replaced = (table: TextTable, [head, ...rest]: string[], text: string): TextTable => ({
  ...table,
  [head!]: rest.length === 0 ? text : replaced(table[head!] as TextTable, rest, text),
});

it('reports every action text line the game asks for as missing at validation, not in play', () => {
  const paths = leafPaths(baseActionText);
  expect(paths.length).toBeGreaterThan(0);
  for (const path of paths) {
    const issues = validateContent({
      source: 'missing-action-text.json',
      data: { ui: [{ ...tuning, actionText: without(baseActionText, path) }] },
    });
    expect(issues.map((issue) => issue.path)).toEqual([`ui[0].actionText.${path.join('.')}`]);
  }
});

it('rejects action text whose placeholders differ from the ones the game fills', () => {
  const lineAt = (path: string[]): string =>
    path.reduce<TextTable | string>((table, key) => (table as TextTable)[key]!, baseActionText) as string;
  const hasPlaceholder = (path: string[]): boolean => PLACEHOLDER.test(lineAt(path));
  const line = leafPaths(baseActionText).find((path) => !hasPlaceholder(path));
  const template = leafPaths(baseActionText).find(hasPlaceholder);
  const issuesFor = (path: string[], text: string) =>
    validateContent({
      source: 'bad-placeholder.json',
      data: { ui: [{ ...tuning, actionText: replaced(baseActionText, path, text) }] },
    }).map((issue) => issue.path);
  const expected = (path: string[]) => [`ui[0].actionText.${path.join('.')}`];
  expect(issuesFor(line!, 'fixture {stray}')).toEqual(expected(line!));
  expect(issuesFor(template!, 'fixture without placeholders')).toEqual(expected(template!));
  expect(issuesFor(template!, 'fixture {stray}')).toEqual(expected(template!));
  expect(issuesFor(template!, `${lineAt(template!)} {stray}`)).toEqual(expected(template!));
});

it('reports content without the core UI tuning at validation, not at startup', () => {
  const { registry } = buildRegistry([{ source: 'other-ui.json', data: { ui: [{ ...tuning, id: 'other' }] } }]);
  expect(requiredContentIssues(registry).some(({ path }) => path === 'ui')).toBe(true);
});
