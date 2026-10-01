// Walks a cartridge and lists every sourced node with its path and unit. The rules iterate this
// instead of each knowing the whole shape, and `unsourcedPaths` tells a consumer which values are
// still missing before it builds geometry from them.

import type { Cartridge, Citation, Measure, MetallicCartridge, Shotshell, Sourced } from './cartridge.ts';

/** What a measure counts. `count` is a positive integer, `gauge`-like numbers included. */
export type Unit = 'mm' | 'deg' | 'grains' | 'count';

export interface MeasureRef {
  readonly path: string;
  readonly node: Measure;
  readonly unit: Unit;
}

/** A non-numeric sourced value (material, primer type, colour…). */
export interface TextRef {
  readonly path: string;
  readonly node: Sourced<string>;
}

export interface CitationRef {
  readonly path: string;
  readonly cite: Citation;
}

export interface CartridgeNodes {
  readonly measures: readonly MeasureRef[];
  readonly texts: readonly TextRef[];
  /** Citations that are not part of a measure or text node: aliases, relations, variants. */
  readonly citations: readonly CitationRef[];
}

const measure = (path: string, node: Measure, unit: Unit): MeasureRef => ({ path, node, unit });

const indexed = <T>(path: string, entries: readonly T[]): (readonly [string, T])[] =>
  entries.map((entry, index) => [`${path}[${index}]`, entry] as const);

const texts = <T extends string>(path: string, entries: readonly Sourced<T>[]): TextRef[] =>
  indexed(path, entries).map(([entryPath, node]) => ({ path: entryPath, node }));

const primerMeasures = (path: string, primer: MetallicCartridge['case']['primer']): MeasureRef[] => [
  measure(`${path}.diameter`, primer.diameter, 'mm'),
];

const headMeasures = (head: MetallicCartridge['case']['head']): MeasureRef[] => {
  const base = 'case.head';
  if (head.type === 'rimmed' || head.type === 'semi-rimmed') {
    return [];
  }
  const groove = [
    measure(`${base}.extractorGroove.diameter`, head.extractorGroove.diameter, 'mm'),
    measure(`${base}.extractorGroove.width`, head.extractorGroove.width, 'mm'),
    ...(head.extractorGroove.bevelAngle === undefined
      ? []
      : [measure(`${base}.extractorGroove.bevelAngle`, head.extractorGroove.bevelAngle, 'deg' as const)]),
  ];
  return head.type === 'belted'
    ? [
        ...groove,
        measure(`${base}.belt.diameter`, head.belt.diameter, 'mm'),
        measure(`${base}.belt.width`, head.belt.width, 'mm'),
      ]
    : groove;
};

const bodyMeasures = (body: MetallicCartridge['case']['body']): MeasureRef[] => {
  const base = 'case.body';
  if (body.type === 'straight') {
    return [
      measure(`${base}.diameterAtHead`, body.diameterAtHead, 'mm'),
      measure(`${base}.diameterAtMouth`, body.diameterAtMouth, 'mm'),
    ];
  }
  return [
    measure(`${base}.diameterAtHead`, body.diameterAtHead, 'mm'),
    measure(`${base}.diameterAtShoulderStart`, body.diameterAtShoulderStart, 'mm'),
    measure(`${base}.shoulder.startPosition`, body.shoulder.startPosition, 'mm'),
    measure(`${base}.shoulder.endPosition`, body.shoulder.endPosition, 'mm'),
    measure(`${base}.shoulder.angle`, body.shoulder.angle, 'deg'),
    measure(`${base}.neck.diameterAtBase`, body.neck.diameterAtBase, 'mm'),
    measure(`${base}.neck.diameterAtMouth`, body.neck.diameterAtMouth, 'mm'),
  ];
};

const variantNodes = (payload: MetallicCartridge['payload']): { measures: MeasureRef[]; citations: CitationRef[] } => {
  const measures: MeasureRef[] = [];
  const citations: CitationRef[] = [];
  for (const [path, variant] of indexed('payload.variants', payload.variants)) {
    citations.push({ path: `${path}.cite`, cite: variant.cite });
    measures.push(measure(`${path}.massGrains`, variant.massGrains, 'grains'));
    if (variant.length !== undefined) {
      measures.push(measure(`${path}.length`, variant.length, 'mm'));
    }
  }
  return { measures, citations };
};

const metallicNodes = (c: MetallicCartridge): Omit<CartridgeNodes, 'citations'> & { citations: CitationRef[] } => {
  const variants = variantNodes(c.payload);
  return {
    measures: [
      measure('case.length', c.case.length, 'mm'),
      measure('case.bodyStart', c.case.bodyStart, 'mm'),
      measure('case.rim.diameter', c.case.rim.diameter, 'mm'),
      measure('case.rim.thickness', c.case.rim.thickness, 'mm'),
      ...headMeasures(c.case.head),
      ...bodyMeasures(c.case.body),
      ...primerMeasures('case.primer', c.case.primer),
      measure('payload.diameter', c.payload.diameter, 'mm'),
      measure('payload.length.min', c.payload.length.min, 'mm'),
      measure('payload.length.max', c.payload.length.max, 'mm'),
      ...variants.measures,
      measure('overallLength.max', c.overallLength.max, 'mm'),
      measure('overallLength.typical', c.overallLength.typical, 'mm'),
    ],
    texts: [
      ...texts('case.materials', c.case.materials),
      ...texts('case.primer.options', c.case.primer.options),
      { path: 'case.primer.designation', node: c.case.primer.designation },
    ],
    citations: variants.citations,
  };
};

const shotshellNodes = (c: Shotshell): Omit<CartridgeNodes, 'citations'> & { citations: CitationRef[] } => ({
  measures: [
    measure('gauge', c.gauge, 'count'),
    measure('boreDiameter', c.boreDiameter, 'mm'),
    measure('hull.outerDiameter', c.hull.outerDiameter, 'mm'),
    measure('head.rimDiameter', c.head.rimDiameter, 'mm'),
    measure('head.rimThickness', c.head.rimThickness, 'mm'),
    measure('head.height', c.head.height, 'mm'),
    measure('length.nominal', c.length.nominal, 'mm'),
    measure('length.loaded', c.length.loaded, 'mm'),
    measure('primer.diameter', c.primer.diameter, 'mm'),
    ...(c.payload.type === 'shot'
      ? [
          measure('payload.pelletCount', c.payload.pelletCount, 'count'),
          measure('payload.pelletDiameter', c.payload.pelletDiameter, 'mm'),
        ]
      : [
          measure('payload.diameter', c.payload.diameter, 'mm'),
          measure('payload.length', c.payload.length, 'mm'),
          measure('payload.massGrains', c.payload.massGrains, 'grains'),
        ]),
  ],
  texts: [
    ...texts('hull.materials', c.hull.materials),
    ...texts('hull.colors', c.hull.colors),
    ...texts('head.materials', c.head.materials),
    { path: 'closure', node: c.closure },
    { path: 'primer.designation', node: c.primer.designation },
    ...texts('primer.options', c.primer.options),
    c.payload.type === 'shot'
      ? { path: 'payload.name', node: c.payload.name }
      : { path: 'payload.style', node: c.payload.style },
  ],
  citations: [],
});

export const collectNodes = (c: Cartridge): CartridgeNodes => {
  const nodes = c.kind === 'metallic' ? metallicNodes(c) : shotshellNodes(c);
  return {
    measures: nodes.measures,
    texts: nodes.texts,
    citations: [
      ...nodes.citations,
      ...indexed('aliases', c.aliases).map(([path, alias]) => ({ path: `${path}.cite`, cite: alias.cite })),
      ...indexed('relatedTo', c.relatedTo).map(([path, relation]) => ({ path: `${path}.cite`, cite: relation.cite })),
    ],
  };
};

/** Every citation in the cartridge, including those on measures and their alternatives. */
export const allCitations = (c: Cartridge): CitationRef[] => {
  const nodes = collectNodes(c);
  const fromMeasures = nodes.measures.flatMap(({ path, node }) => [
    ...(node.cite === null ? [] : [{ path: `${path}.cite`, cite: node.cite }]),
    ...indexed(`${path}.alternatives`, node.alternatives ?? []).map(([altPath, alt]) => ({
      path: `${altPath}.cite`,
      cite: alt.cite,
    })),
  ]);
  const fromTexts = nodes.texts.flatMap(({ path, node }) =>
    node.cite === null ? [] : [{ path: `${path}.cite`, cite: node.cite }],
  );
  return [...fromMeasures, ...fromTexts, ...nodes.citations];
};

/** Paths of values that are still null: what a consumer must not build geometry from yet. */
export const unsourcedPaths = (c: Cartridge): string[] => {
  const nodes = collectNodes(c);
  return [...nodes.measures, ...nodes.texts].filter(({ node }) => node.value === null).map(({ path }) => path);
};
