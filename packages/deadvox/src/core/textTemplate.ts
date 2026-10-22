// Content text names the values code fills in as `{slot}`, so a pack can reword or reorder a line around them.
const SLOT = /\{([A-Za-z]+)\}/g;
const SPLIT = /\{([A-Za-z]+)\}/;

/** The slot names a template uses, in order of appearance. */
export const templateSlots = (template: string): string[] => [...template.matchAll(SLOT)].map(([, name]) => name!);

/** The template's text with each slot replaced by its value, as alternating text and values. */
export const fillParts = <T>(template: string, slots: Readonly<Record<string, T>>): (string | T)[] =>
  template.split(SPLIT).map((part, index) => (index % 2 === 0 ? part : slots[part]!));

export const fillText = (template: string, slots: Readonly<Record<string, string | number>>): string =>
  fillParts(template, slots).join('');
