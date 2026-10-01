import { describe, expect, it } from 'vitest';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { variant } from './helpers.ts';

const tiltedMagazine = (template: string, profile = 'standard') =>
  variant(template, (draft) => {
    draft.parts.magazine!.params!.orientation = 'tilt';
    draft.parts.magazine!.params!.profile = profile;
  });

const wellLayoutIssues = (assembly: ReturnType<typeof tiltedMagazine>) =>
  validate(assembly, gunDomain).issues.filter(({ rule }) => rule === 'magazine-well-axis');

const magazineGapIssues = (assembly: ReturnType<typeof tiltedMagazine>) =>
  validate(assembly, gunDomain).issues.filter(
    ({ rule, parts }) => rule === 'connection-contact' && parts.includes('lower') && parts.includes('magazine'),
  );

describe('tilted magazine well layout support', () => {
  it('refuses the SMG magazine in the slanted conventional well clearly, not as a contact gap', () => {
    const assembly = tiltedMagazine('archetype-battle-rifle', 'smg');
    const report = validate(assembly, gunDomain);
    expect(report.ok || wellLayoutIssues(assembly).length > 0).toBe(true);
    expect(magazineGapIssues(assembly)).toEqual([]);
  });
});

describe('recessed magazine well sized to the magazine profile', () => {
  it('seats the narrower SMG magazine in a recessed well without a contact gap', () => {
    const assembly = variant('archetype-smg', (draft) => {
      draft.parts.lower!.params!.magazineWell = 'recessed';
    });
    const report = validate(assembly, gunDomain);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });
});
