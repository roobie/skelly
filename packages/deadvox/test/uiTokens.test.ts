// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { buildRegistry, requiredContentIssues, validateContent } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CORE_LABEL_SLOTS, CORE_MESSAGE_SLOTS } from '../src/core/coreText.ts';
import { applyUiTokens } from '../src/ui/uiTokens.ts';

const refusalSound = {
  id: 'player_nope',
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
const tuning = {
  id: CORE_CONTENT_IDS.coreUi,
  spacing: 1,
  hudScale: 1,
  refusalSound: refusalSound.id,
  restLabels: { rest: 'fixture rest', sleep: 'fixture sleep' },
  doorCloseBlockedMessages: { player: 'fixture player blocks', other: 'fixture other blocks' },
  itemActionLabels: { stripRound: 'fixture strip' },
  coreMessages,
  coreActionLabels: slottedFixture(CORE_LABEL_SLOTS),
  wearSlotLabels,
  furnitureMoveMessages: Object.fromEntries(
    [
      'tooBig',
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
    itemActionLabels: _i,
    coreMessages: _m,
    coreActionLabels: _a,
    wearSlotLabels: _w,
    furnitureMoveMessages: _f,
    ...bare
  } = tuning;
  const missing = validateContent({ source: 'no-text.json', data: { ui: [bare] } });
  expect(missing.map(({ path }) => path)).toEqual([
    'ui[0].restLabels',
    'ui[0].doorCloseBlockedMessages',
    'ui[0].furnitureMoveMessages',
    'ui[0].itemActionLabels',
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

it('reports content without the core UI tuning at validation, not at startup', () => {
  const { registry } = buildRegistry([{ source: 'other-ui.json', data: { ui: [{ ...tuning, id: 'other' }] } }]);
  expect(requiredContentIssues(registry).some(({ path }) => path === 'ui')).toBe(true);
});
