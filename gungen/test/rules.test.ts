import { describe, expect, it } from 'vitest';
import { CORE_RULE_IDS } from '../src/core/issue.ts';
import { CORE_RULES } from '../src/core/rules.ts';
import type { Assembly, Domain } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { pistolBarrelCrown } from '../src/gun/rules.ts';
import { loadFixture, variant } from './helpers.ts';

const rulesFailed = (a: Assembly, domain: Domain = gunDomain) =>
  [...new Set(validate(a, domain).issues.map((i) => i.rule))].sort();

describe('rules', () => {
  it('port-compat: rejects mismatched mounts', () => {
    const a = variant('archetype-battle-rifle', (x) => {
      const swapped: Record<string, (typeof x.connections)[number]> = {
        'stock.front': { from: 'receiver.stock', to: 'grip.top' },
        'grip.top': { from: 'lower.grip', to: 'stock.front' },
      };
      x.connections = x.connections.map((c) => swapped[c.to] ?? c);
    });
    const issues = validate(a, gunDomain).issues.filter((i) => i.rule === 'port-compat');
    expect(issues.map((i) => i.message)).toEqual([
      'lower.grip is a grip mount but stock.front is a stock mount.',
      'receiver.stock is a stock mount but grip.top is a grip mount.',
    ]);
  });

  it('port-compat: rejects two parts on one rail slot', () => {
    const a = variant('archetype-battle-rifle', (x) => {
      x.parts.sight2 = { family: 'sight' };
      x.connections.push({ from: 'receiver.rail', slot: 3, to: 'sight2.base' });
    });
    const messages = validate(a, gunDomain)
      .issues.filter((i) => i.rule === 'port-compat')
      .map((i) => i.message);
    expect(messages).toEqual(['receiver.rail[3] is used by both connection #7 and #8.']);
  });

  it('axis-alignment: rejects a bore that is parallel but offset', () => {
    // A domain whose barrel bore sits 1u above its mounting port.
    const offsetBarrel = gunDomain.families.barrel!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        barrel: {
          ...offsetBarrel,
          build: (p) => {
            const def = offsetBarrel.build(p);
            return { ...def, axes: [{ kind: 'bore', origin: [0, 1, 0], dir: [1, 0, 0] }] };
          },
        },
      },
    };
    const { issues } = validate(loadFixture('archetype-battle-rifle'), domain);
    expect(issues.map((i) => i.message)).toEqual(['The bore axis of barrel is 1u off the main axis.']);
  });

  it('axis-alignment: rejects an assembly not rooted on the bore line', () => {
    const a = variant('archetype-battle-rifle', (x) => {
      x.root = 'grip';
    });
    expect(rulesFailed(a)).toEqual(['axis-alignment']);
  });

  it('keep-out: the part attached at the allowed port may occupy the volume', () => {
    // The magazine sits in the lower's magazine-path volume.
    expect(rulesFailed(loadFixture('archetype-battle-rifle'))).toEqual([]);
  });

  it('keep-out: explicitly allowed front sights may occupy a rear sight line', () => {
    const ar = loadFixture('archetype-ar');
    expect(validate(ar, gunDomain).issues.filter(({ rule }) => rule === 'keep-out')).toEqual([]);
    const sight = gunDomain.families.sight!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        sight: {
          ...sight,
          build: (params) => {
            const def = sight.build(params);
            return {
              ...def,
              keepOuts: def.keepOuts.map(({ allowFamilies: _allowed, ...ko }) => ko),
            };
          },
        },
      },
    };
    expect(
      validate(ar, domain).issues.some(
        ({ rule, parts }) => rule === 'keep-out' && parts.includes('front-sight') && parts.includes('sight'),
      ),
    ).toBe(true);
  });

  it('keep-out: without the allowance, the magazine intrudes', () => {
    const lower = gunDomain.families.lower!;
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        lower: {
          ...lower,
          build: (p) => {
            const def = lower.build(p);
            return { ...def, keepOuts: def.keepOuts.map(({ allowPort: _, ...k }) => k) };
          },
        },
      },
    };
    const { issues } = validate(loadFixture('archetype-battle-rifle'), domain);
    // The enlarged well path contains the magazine, with 0.25u of clearance per side.
    expect(issues.map((i) => i.message)).toEqual(['magazine intrudes 2.75u into the magazine-path volume of lower.']);
  });

  it('solid-overlap: beveled grip mates without relying on the old global allowance', () => {
    const r = validate(loadFixture('archetype-battle-rifle'), gunDomain);
    expect(r.issues).toEqual([]);
  });

  it('solid-overlap: mount-specific zero allowance rejects a too-tight clamp', () => {
    const a = variant('archetype-battle-rifle', (x) => {
      x.parts.handguard = { family: 'handguard', params: { barrelBore: 'S', fit: 'too-tight' } };
    });
    const issues = validate(a, gunDomain).issues.filter((issue) => issue.rule === 'solid-overlap');
    expect(issues.some((issue) => issue.parts.includes('handguard') && issue.parts.includes('barrel'))).toBe(true);
  });

  it('domain rules are pluggable: without them, a gripless rifle passes', () => {
    const gripless = loadFixture('broken-firing-grip');
    expect(rulesFailed(gripless)).toEqual(['firing-grip']);
    expect(rulesFailed(gripless, { ...gunDomain, rules: [] })).toEqual([]);
  });

  it('feed-match: box-fed receiver on a trigger-only lower', () => {
    const { issues } = validate(loadFixture('broken-feed-match'), gunDomain);
    expect(issues.map((i) => i.message)).toEqual(['receiver is box-fed, but lower (trigger) has no magazine well.']);
  });

  it('pistol frame, hollow slide, and barrel close without solid overlap', () => {
    const report = validate(loadFixture('archetype-pistol'), gunDomain);
    expect(report.ok).toBe(true);
    expect(report.issues.filter((issue) => issue.rule === 'solid-overlap')).toEqual([]);
    expect(report.issues.filter((issue) => issue.rule === 'pistol-barrel-crown')).toEqual([]);
  });

  it('measures the pistol crown between the placed barrel and slide ends', () => {
    const { resolved } = validate(loadFixture('archetype-pistol'), gunDomain);
    const placed = new Map(resolved.placed);
    const barrel = placed.get('barrel')!;
    placed.set('barrel', { ...barrel, t: [barrel.t[0] + 2, barrel.t[1], barrel.t[2]] });
    const issues = pistolBarrelCrown.check({ ...resolved, placed });
    expect(issues.map(({ message }) => message)).toEqual([
      'The barrel protrudes 3.00u past the slide; the pistol crown must be 0.5–1.5u.',
    ]);
  });

  it('pistol crown rule rejects a barrel that extends more than 1.5u past the slide', () => {
    const { issues } = validate(loadFixture('broken-pistol-barrel-crown'), gunDomain);
    expect(issues.filter((issue) => issue.rule === 'pistol-barrel-crown').map((issue) => issue.message)).toEqual([
      'The barrel protrudes 5.00u past the slide; the pistol crown must be 0.5–1.5u.',
    ]);
  });

  it('feed-match: tube-fed receiver on a lower with a magazine well', () => {
    const a = variant('archetype-pump-shotgun', (x) => {
      x.parts.lower = { family: 'lower', params: { layout: 'conventional' } };
      x.parts.magazine = { family: 'magazine' };
      x.connections.push({ from: 'lower.magazine', to: 'magazine.top' });
    });
    const messages = validate(a, gunDomain)
      .issues.filter((i) => i.rule === 'feed-match')
      .map((i) => i.message);
    expect(messages).toEqual([
      "receiver is tube-fed, but lower (conventional) has a magazine well it can't feed from.",
    ]);
  });

  it('feed-match: top-fed receivers take a magazine well too', () => {
    expect(rulesFailed(loadFixture('archetype-bolt-rifle'))).toEqual([]);
  });

  it('feed-match: cylinder-fed revolver needs no magazine well', () => {
    expect(rulesFailed(loadFixture('archetype-revolver'))).toEqual([]);
    const { issues } = validate(loadFixture('broken-revolver-misaligned-cylinder'), gunDomain);
    expect(issues.map((issue) => issue.rule)).toContain('axis-alignment');
  });

  it('feed-match: revolver action and cylinder feed are inseparable', () => {
    const { issues } = validate(loadFixture('broken-revolver-feed-mismatch'), gunDomain);
    expect(issues.filter((issue) => issue.rule === 'feed-match').map((issue) => issue.message)).toEqual([
      'receiver uses revolver action with box feed; revolvers require cylinder feed and other actions do not use it.',
    ]);
  });
});

describe('rule id registry', () => {
  it('CORE_RULE_IDS is the core rule ids plus structure', () => {
    expect([...CORE_RULE_IDS].sort()).toEqual([...CORE_RULES.map((r) => r.id), 'structure'].sort());
  });
});
