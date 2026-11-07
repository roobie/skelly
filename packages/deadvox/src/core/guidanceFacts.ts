export const HANDLING_FACTS = [
  'unpack',
  'wield',
  'inspect',
  'partial',
  'ready',
  'reload',
  'sighted',
  'unload',
] as const;
export type HandlingFact = (typeof HANDLING_FACTS)[number];

export const HANDLING_MECHANISMS = ['revolver', 'pump'] as const;
export type HandlingMechanism = (typeof HANDLING_MECHANISMS)[number];
