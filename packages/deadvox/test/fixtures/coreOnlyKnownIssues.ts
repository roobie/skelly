import type { ContentIssue } from '../../src/core/content.ts';

type Owner = 'sound selection' | 'scenario starts' | 'core extraction' | 'theme extraction';
interface KnownIssue {
  owner: Owner;
  issue: ContentIssue;
}
const known = (owner: Owner, source: string, path: string, message: string): KnownIssue => ({
  owner,
  issue: { source, path, message },
});
const missing = (owner: Owner, section: string, capability: string): KnownIssue =>
  known(owner, 'core content', section, `missing required capability "${capability}"`);

// #1532 removes this exact ledger; it must not derive expectations from the validator's dispatch tables.
export const CORE_ONLY_KNOWN_ISSUES: readonly KnownIssue[] = [
  known('core extraction', 'core-only/figures-player.json', 'figures[0].body.model', 'no model "player_bust"'),
  known('core extraction', 'core-only/figures-player.json', 'figures[0].limbs.leftArm.model', 'no model "player_arm"'),
  known('core extraction', 'core-only/figures-player.json', 'figures[0].limbs.rightArm.model', 'no model "player_arm"'),
  known('core extraction', 'core-only/figures-player.json', 'figures[0].limbs.leftLeg.model', 'no model "player_leg"'),
  known('core extraction', 'core-only/figures-player.json', 'figures[0].limbs.rightLeg.model', 'no model "player_leg"'),
  missing('core extraction', 'figures', 'player'),
  missing('scenario starts', 'siteGeneration', 'authoredSite'),
  missing('theme extraction', 'powerTuning', 'power'),
  known('core extraction', 'core content', 'items', 'expected exactly one work-in-progress item definition'),
];
