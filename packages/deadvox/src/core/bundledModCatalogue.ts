export interface BundledModEntry {
  id: string;
  label: string;
  detail: string;
}

const isText = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '';

/** Schema of the bundled mod catalogue; every problem is listed, none is repaired. */
export const bundledModCatalogueIssues = (value: unknown): string[] => {
  const mods = (value as { mods?: unknown } | null)?.mods;
  if (!Array.isArray(mods)) {
    return ['mods must be a list'];
  }
  const issues: string[] = [];
  const seen = new Set<string>();
  mods.forEach((row: unknown, index) => {
    const entry = (row ?? {}) as Record<string, unknown>;
    for (const field of ['id', 'label', 'detail']) {
      if (!isText(entry[field])) {
        issues.push(`mods[${index}].${field} must be a non-empty string`);
      }
    }
    if (isText(entry.id)) {
      if (seen.has(entry.id)) {
        issues.push(`mods[${index}].id "${entry.id}" is duplicated`);
      }
      seen.add(entry.id);
    }
  });
  return issues;
};

export const bundledModCatalogue = (value: unknown): BundledModEntry[] => {
  const issues = bundledModCatalogueIssues(value);
  if (issues.length > 0) {
    throw new Error(`Invalid bundled mod catalogue: ${issues.join('; ')}`);
  }
  return (value as { mods: BundledModEntry[] }).mods;
};
