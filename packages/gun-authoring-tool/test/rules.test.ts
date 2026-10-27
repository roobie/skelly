import { CORE_RULES } from '@skelly/engine/assembly/rules.ts';
import type { Assembly, Domain } from '@skelly/engine/assembly/schema.ts';
import { validate } from '@skelly/engine/assembly/validate.ts';
import { CORE_RULE_IDS } from '@skelly/engine/foundation/issue.ts';
import { describe, expect, it } from 'vitest';
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
    expect(messages).toEqual(['receiver.rail[3] is used by both connection #8 and #9.']);
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

  it('keep-out: explicitly allowed front sights may occupy a sightline volume', () => {
    const ar = loadFixture('archetype-ar');
    const sight = gunDomain.families.sight!;
    const withAllowance = (allow: boolean): Domain => ({
      ...gunDomain,
      families: {
        ...gunDomain.families,
        sight: {
          ...sight,
          build: (params) => {
            const def = sight.build(params);
            return {
              ...def,
              keepOuts: def.keepOuts.map(({ allowFamilies: _families, ...ko }) => ({
                ...ko,
                box: { ...ko.box, half: [ko.box.half[0], 10, 10] },
                ...(allow ? { allowFamilies: ['front-sight', 'rail-front-sight'] } : {}),
              })),
            };
          },
        },
      },
    });
    const hitsFrontSight = (domain: Domain): boolean =>
      validate(ar, domain).issues.some(
        ({ rule, parts }) => rule === 'keep-out' && parts.includes('front-sight') && parts.includes('sight'),
      );
    expect(hitsFrontSight(withAllowance(true))).toBe(false);
    expect(hitsFrontSight(withAllowance(false))).toBe(true);
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
    const issues = validate(loadFixture('archetype-battle-rifle'), domain).issues.filter(
      (issue) => issue.rule === 'keep-out',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.parts).toEqual(expect.arrayContaining(['lower', 'magazine']));
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
    const issues = validate(loadFixture('broken-pistol-barrel-crown'), gunDomain).issues.filter(
      (issue) => issue.rule === 'pistol-barrel-crown',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.parts).toEqual(expect.arrayContaining(['barrel', 'slide']));
  });

  it('refuses a pump tube longer than its barrel while allowing an equal-length tube', () => {
    const equalLength = variant('archetype-pump-shotgun', (x) => {
      x.parts.tube!.params = { lengthPercent: '100' };
    });
    expect(validate(equalLength, gunDomain).ok).toBe(true);

    const tube = gunDomain.families['tube-magazine']!;
    const longest = Math.max(...tube.params.lengthPercent!.values.map(Number));
    const longer = String(longest + 1);
    const domain: Domain = {
      ...gunDomain,
      families: {
        ...gunDomain.families,
        'tube-magazine': {
          ...tube,
          params: {
            ...tube.params,
            lengthPercent: { ...tube.params.lengthPercent!, values: [...tube.params.lengthPercent!.values, longer] },
          },
        },
      },
    };
    const tooLong = variant('archetype-pump-shotgun', (x) => {
      x.parts.tube!.params = { lengthPercent: longer };
    });
    expect(validate(tooLong, domain).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'structure',
          message: 'Part "tube" (tube-magazine) cannot be built: Tube magazines cannot be longer than their barrels.',
        }),
      ]),
    );
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

  it('revolver alignment rules run on the curated design and retain generic axis-alignment', () => {
    const revolverRuleIds = [
      'revolver-top-chamber-bore',
      'revolver-cylinder-axis',
      'revolver-cylinder-gap',
      'revolver-topstrap-span',
      'revolver-grip-joint',
    ];
    expect(gunDomain.rules?.map(({ id }) => id)).toEqual(expect.arrayContaining(revolverRuleIds));
    const { issues } = validate(loadFixture('broken-revolver-misaligned-cylinder'), gunDomain);
    expect(issues.map((issue) => issue.rule)).toContain('axis-alignment');
  });
});

describe('rule id registry', () => {
  it('CORE_RULE_IDS is the core rule ids plus structure', () => {
    expect([...CORE_RULE_IDS].sort()).toEqual([...CORE_RULES.map((r) => r.id), 'structure'].sort());
  });
});
