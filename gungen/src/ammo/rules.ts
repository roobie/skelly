// Validation rules for cartridge data: pure functions from a Cartridge to readable issues. They
// check consistency (geometry, units, sourcing), not truth: a standard's own numbers can't be
// judged here, only that the file does not contradict itself. A rule skips any comparison that
// involves a null (unsourced) value; `unsourcedPaths` reports those separately.
//
// There are no absolute size limits: everything from a 9x18 pistol round to a .50 BMG must pass.
// The only absolute number is RIMLESS_RIM_HEAD_TOLERANCE_MM, a sanity bound that catches swapped
// fields and unit slips, not a standard.

import type { Cartridge, Measure, MetallicCartridge, Shotshell } from './cartridge.ts';
import { allCitations, collectNodes, type MeasureRef } from './measures.ts';

export interface CartridgeIssue {
  readonly rule: string;
  readonly path: string;
  readonly message: string;
}

export interface CartridgeRule {
  readonly id: string;
  readonly check: (cartridge: Cartridge) => CartridgeIssue[];
}

/**
 * A rimless case's rim is cut from the head diameter, so the two differ by hundredths of a
 * millimetre in real standards. Anything further apart is a swapped or mistyped field.
 */
export const RIMLESS_RIM_HEAD_TOLERANCE_MM = 0.5;

// ---------------------------------------------------------------- comparison helpers

interface Quantity {
  readonly path: string;
  readonly value: number | null;
}

const quantity = (path: string, node: Measure): Quantity => ({ path, value: node.value });

type Comparison = '>' | '>=' | '<' | '<=';

const holds = (left: number, comparison: Comparison, right: number): boolean => {
  switch (comparison) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    default:
      return false;
  }
};

/** Checks each neighbouring pair of `chain` against `comparison`, skipping pairs with a null. */
const chain = (rule: string, comparison: Comparison, ...items: readonly Quantity[]): CartridgeIssue[] => {
  const issues: CartridgeIssue[] = [];
  for (let index = 0; index + 1 < items.length; index++) {
    const left = items[index] as Quantity;
    const right = items[index + 1] as Quantity;
    if (left.value !== null && right.value !== null && !holds(left.value, comparison, right.value)) {
      issues.push({
        rule,
        path: left.path,
        message: `${left.path} (${left.value}) must be ${comparison} ${right.path} (${right.value})`,
      });
    }
  }
  return issues;
};

const sum = (path: string, ...items: readonly Quantity[]): Quantity => ({
  path,
  value: items.some((item) => item.value === null) ? null : items.reduce((total, item) => total + (item.value ?? 0), 0),
});

// ---------------------------------------------------------------- sources

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const HTTP_URL = /^https?:\/\//;

// Date.UTC rolls an impossible day over (month 13, Feb 30), so a round trip catches those.
const isCalendarDate = (text: string): boolean => {
  if (!ISO_DATE.test(text)) {
    return false;
  }
  const [year, month, day] = text.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const sourceDocumentIssues = (cartridge: Cartridge): CartridgeIssue[] =>
  Object.entries(cartridge.sources).flatMap(([id, source]) => {
    const path = `sources.${id}`;
    const issues: CartridgeIssue[] = [];
    if (!isCalendarDate(source.retrieved)) {
      issues.push({
        rule: 'sources',
        path: `${path}.retrieved`,
        message: `'${source.retrieved}' is not a YYYY-MM-DD date`,
      });
    }
    if (source.reliability !== 'synthetic' && !HTTP_URL.test(source.url)) {
      issues.push({ rule: 'sources', path: `${path}.url`, message: `'${source.url}' is not an http(s) URL` });
    }
    if (source.sha256 !== undefined && !SHA256.test(source.sha256)) {
      issues.push({ rule: 'sources', path: `${path}.sha256`, message: 'expected 64 lowercase hex digits' });
    }
    return issues;
  });

const sourcesRule: CartridgeRule = {
  id: 'sources',
  check: (cartridge) => {
    const issues = sourceDocumentIssues(cartridge);
    if (!(cartridge.primarySource in cartridge.sources)) {
      issues.push({
        rule: 'sources',
        path: 'primarySource',
        message: `'${cartridge.primarySource}' is not a key of sources`,
      });
    }
    for (const { path, cite } of allCitations(cartridge)) {
      if (!(cite.source in cartridge.sources)) {
        issues.push({ rule: 'sources', path, message: `cites unknown source '${cite.source}'` });
      }
    }
    return issues;
  },
};

// Every value has a source: a non-null value needs a citation, a null one needs a note saying why.
const sourcedValuesRule: CartridgeRule = {
  id: 'sourced-values',
  check: (cartridge) => {
    const nodes = collectNodes(cartridge);
    return [...nodes.measures, ...nodes.texts].flatMap(({ path, node }) => {
      if (node.value !== null && node.cite === null) {
        return [{ rule: 'sourced-values', path, message: 'has a value but no citation' }];
      }
      if (node.value === null && (node.note === undefined || node.note.trim() === '')) {
        return [{ rule: 'sourced-values', path, message: 'is null without a note saying why it is unsourced' }];
      }
      return [];
    });
  },
};

// ---------------------------------------------------------------- units

const unitProblem = (ref: MeasureRef, value: number): string | null => {
  switch (ref.unit) {
    case 'mm':
    case 'grains':
      return value > 0 ? null : `must be positive (${ref.unit}), got ${value}`;
    case 'deg':
      return value > 0 && value < 180 ? null : `must be an angle in (0, 180) degrees, got ${value}`;
    case 'count':
      return Number.isInteger(value) && value > 0 ? null : `must be a positive integer, got ${value}`;
    default:
      return null;
  }
};

const toleranceIssues = ({ path, node }: MeasureRef): CartridgeIssue[] =>
  (['minus', 'plus'] as const).flatMap((side) => {
    const magnitude = node.tolerance?.[side];
    return magnitude !== undefined && magnitude < 0
      ? [{ rule: 'units', path: `${path}.tolerance.${side}`, message: 'a tolerance is a magnitude, not negative' }]
      : [];
  });

const unitsRule: CartridgeRule = {
  id: 'units',
  check: (cartridge) =>
    collectNodes(cartridge).measures.flatMap((ref) => {
      const values = [
        { path: ref.path, value: ref.node.value },
        ...(ref.node.alternatives ?? []).map((alt, index) => ({
          path: `${ref.path}.alternatives[${index}]`,
          value: alt.value,
        })),
      ];
      const problems = values.flatMap(({ path, value }) => {
        const problem = value === null ? null : unitProblem(ref, value);
        return problem === null ? [] : [{ rule: 'units', path, message: problem }];
      });
      return [...problems, ...toleranceIssues(ref)];
    }),
};

// ---------------------------------------------------------------- metallic geometry

/** Rim against head diameter, and what the groove and belt must clear, by head type. */
const headTypeIssues = (c: MetallicCartridge): CartridgeIssue[] => {
  const rim = quantity('case.rim.diameter', c.case.rim.diameter);
  const head = quantity('case.body.diameterAtHead', c.case.body.diameterAtHead);
  const rule = 'head-type';
  const spread = rim.value !== null && head.value !== null ? Math.abs(rim.value - head.value) : 0;
  switch (c.case.head.type) {
    case 'rimless':
      return [
        ...(spread > RIMLESS_RIM_HEAD_TOLERANCE_MM
          ? [
              {
                rule,
                path: rim.path,
                message: `a rimless rim (${rim.value}) must be within ${RIMLESS_RIM_HEAD_TOLERANCE_MM} mm of the head diameter (${head.value})`,
              },
            ]
          : []),
        ...chain(rule, '<', quantity('case.head.extractorGroove.diameter', c.case.head.extractorGroove.diameter), head),
      ];
    case 'rebated':
      return [
        ...chain(rule, '<', rim, head),
        ...chain(rule, '<', quantity('case.head.extractorGroove.diameter', c.case.head.extractorGroove.diameter), rim),
      ];
    case 'rimmed':
    case 'semi-rimmed':
      return chain(rule, '>', rim, head);
    case 'belted':
      return [
        ...chain(rule, '>=', rim, head),
        ...chain(rule, '>', quantity('case.head.belt.diameter', c.case.head.belt.diameter), head),
        ...chain(rule, '<', quantity('case.head.extractorGroove.diameter', c.case.head.extractorGroove.diameter), head),
      ];
    default:
      return [];
  }
};

const headTypeRule: CartridgeRule = {
  id: 'head-type',
  check: (cartridge) => (cartridge.kind === 'metallic' ? headTypeIssues(cartridge) : []),
};

// Diameters narrow from head to mouth: head > shoulder start > neck for a bottleneck, head >= mouth for a
// straight case. The bullet is checked against the neck in `neck-wall`.
const diameterIssues = (c: MetallicCartridge): CartridgeIssue[] => {
  const { body } = c.case;
  const head = quantity('case.body.diameterAtHead', body.diameterAtHead);
  if (body.type === 'straight') {
    return chain('diameters', '>=', head, quantity('case.body.diameterAtMouth', body.diameterAtMouth));
  }
  return chain(
    'diameters',
    '>',
    head,
    quantity('case.body.diameterAtShoulderStart', body.diameterAtShoulderStart),
    quantity('case.body.neck.diameterAtBase', body.neck.diameterAtBase),
  );
};

const diametersRule: CartridgeRule = {
  id: 'diameters',
  check: (cartridge) => (cartridge.kind === 'metallic' ? diameterIssues(cartridge) : []),
};

// The case wall at the neck (or at the mouth of a straight case) is (outer diameter - bullet
// diameter) / 2 at the very least, so the outer diameter must exceed the bullet diameter.
const neckWallIssues = (c: MetallicCartridge): CartridgeIssue[] => {
  const bullet = quantity('payload.diameter', c.payload.diameter);
  const { body } = c.case;
  const outers =
    body.type === 'straight'
      ? [quantity('case.body.diameterAtMouth', body.diameterAtMouth)]
      : [
          quantity('case.body.neck.diameterAtBase', body.neck.diameterAtBase),
          quantity('case.body.neck.diameterAtMouth', body.neck.diameterAtMouth),
        ];
  return outers.flatMap((outer) =>
    chain('neck-wall', '>', outer, bullet).map((issue) => ({
      ...issue,
      message: `neck wall is not positive: ${issue.message}`,
    })),
  );
};

const neckWallRule: CartridgeRule = {
  id: 'neck-wall',
  check: (cartridge) => (cartridge.kind === 'metallic' ? neckWallIssues(cartridge) : []),
};

// Positions run from the head face to the mouth in this order: rim, groove, (belt), body start,
// shoulder start, shoulder end, case length.
const positionIssues = (c: MetallicCartridge): CartridgeIssue[] => {
  const rule = 'positions';
  const rimThickness = quantity('case.rim.thickness', c.case.rim.thickness);
  const bodyStart = quantity('case.bodyStart', c.case.bodyStart);
  const { head, body } = c.case;
  const grooveEnd =
    head.type === 'rimmed' || head.type === 'semi-rimmed'
      ? rimThickness
      : sum(
          'rim thickness + groove width',
          rimThickness,
          quantity('case.head.extractorGroove.width', head.extractorGroove.width),
        );
  const headIssues =
    head.type === 'belted'
      ? chain(rule, '<=', grooveEnd, quantity('case.head.belt.width', head.belt.width), bodyStart)
      : chain(rule, '<=', grooveEnd, bodyStart);
  const caseLength = quantity('case.length', c.case.length);
  const bodyIssues =
    body.type === 'straight'
      ? chain(rule, '<', bodyStart, caseLength)
      : chain(
          rule,
          '<',
          bodyStart,
          quantity('case.body.shoulder.startPosition', body.shoulder.startPosition),
          quantity('case.body.shoulder.endPosition', body.shoulder.endPosition),
          caseLength,
        );
  return [...headIssues, ...bodyIssues];
};

const positionsRule: CartridgeRule = {
  id: 'positions',
  check: (cartridge) => (cartridge.kind === 'metallic' ? positionIssues(cartridge) : []),
};

const lengthIssues = (c: MetallicCartridge): CartridgeIssue[] => {
  const rule = 'lengths';
  const caseLength = quantity('case.length', c.case.length);
  const max = quantity('overallLength.max', c.overallLength.max);
  const typical = quantity('overallLength.typical', c.overallLength.typical);
  return [
    ...chain(rule, '<', caseLength, max),
    ...chain(rule, '<', caseLength, typical),
    ...chain(rule, '>=', max, typical),
    ...chain(
      rule,
      '<=',
      quantity('payload.length.min', c.payload.length.min),
      quantity('payload.length.max', c.payload.length.max),
    ),
  ];
};

const lengthsRule: CartridgeRule = {
  id: 'lengths',
  check: (cartridge) => (cartridge.kind === 'metallic' ? lengthIssues(cartridge) : []),
};

// ---------------------------------------------------------------- shotshell geometry

const shotshellIssues = (c: Shotshell): CartridgeIssue[] => {
  const rule = 'shotshell';
  const hull = quantity('hull.outerDiameter', c.hull.outerDiameter);
  const bore = quantity('boreDiameter', c.boreDiameter);
  const loaded = quantity('length.loaded', c.length.loaded);
  const payloadIssues =
    c.payload.type === 'shot'
      ? chain(rule, '<', quantity('payload.pelletDiameter', c.payload.pelletDiameter), bore)
      : [
          ...chain(rule, '<', quantity('payload.diameter', c.payload.diameter), hull),
          ...chain(rule, '<', quantity('payload.length', c.payload.length), loaded),
        ];
  return [
    // A crimp closes the shell, so it is never longer than the opened shell.
    ...chain(rule, '<=', loaded, quantity('length.nominal', c.length.nominal)),
    ...chain(rule, '<', quantity('head.height', c.head.height), loaded),
    ...chain(rule, '<', quantity('head.rimThickness', c.head.rimThickness), quantity('head.height', c.head.height)),
    ...chain(rule, '>', quantity('head.rimDiameter', c.head.rimDiameter), hull),
    ...chain(rule, '<', bore, hull),
    ...payloadIssues,
  ];
};

const shotshellRule: CartridgeRule = {
  id: 'shotshell',
  check: (cartridge) => (cartridge.kind === 'shotshell' ? shotshellIssues(cartridge) : []),
};

// ---------------------------------------------------------------- entry points

export const CARTRIDGE_RULES: readonly CartridgeRule[] = [
  sourcesRule,
  sourcedValuesRule,
  unitsRule,
  headTypeRule,
  diametersRule,
  neckWallRule,
  positionsRule,
  lengthsRule,
  shotshellRule,
];

/** Every issue from every rule, in rule order. Empty means the file is consistent. */
export const validateCartridge = (cartridge: Cartridge): CartridgeIssue[] =>
  CARTRIDGE_RULES.flatMap((rule) => rule.check(cartridge));

/**
 * Checks a set of cartridges against each other: relations name cartridges in the set, never
 * the cartridge itself, and never contradict each other for one pair.
 */
export const checkRelations = (cartridges: readonly Cartridge[]): CartridgeIssue[] => {
  const ids = new Set(cartridges.map((c) => c.id));
  return cartridges.flatMap((cartridge) => {
    const issues: CartridgeIssue[] = [];
    cartridge.relatedTo.forEach((relation, index) => {
      const path = `${cartridge.id}.relatedTo[${index}]`;
      if (relation.cartridge === cartridge.id) {
        issues.push({ rule: 'relations', path, message: 'a cartridge cannot be related to itself' });
      } else if (!ids.has(relation.cartridge)) {
        issues.push({ rule: 'relations', path, message: `unknown cartridge '${relation.cartridge}'` });
      }
    });
    const safe = new Set(
      cartridge.relatedTo.filter((r) => r.relation === 'safe-in-chamber-of').map((r) => r.cartridge),
    );
    for (const relation of cartridge.relatedTo) {
      if (relation.relation === 'unsafe-in-chamber-of' && safe.has(relation.cartridge)) {
        issues.push({
          rule: 'relations',
          path: `${cartridge.id}.relatedTo`,
          message: `'${cartridge.id}' is declared both safe and unsafe in the chamber of '${relation.cartridge}'`,
        });
      }
    }
    return issues;
  });
};
