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
  const { folderMods } = value as { folderMods?: unknown };
  if (folderMods !== undefined) {
    if (!Array.isArray(folderMods)) {
      return [...issues, 'folderMods must be a list'];
    }
    folderMods.forEach((id: unknown, index) => {
      if (!isText(id)) {
        issues.push(`folderMods[${index}] must be a non-empty string`);
      } else if (seen.has(id)) {
        issues.push(`folderMods[${index}] "${id}" is duplicated`);
      } else {
        seen.add(id);
      }
    });
  }
  return issues;
};

export const bundledModCatalogue = (value: unknown): BundledModEntry[] => {
  const issues = bundledModCatalogueIssues(value);
  if (issues.length > 0) {
    throw new Error(`Invalid bundled mod catalogue: ${issues.join('; ')}`);
  }
  return (value as { mods: BundledModEntry[] }).mods;
};

/** The site launcher's list: the bundled catalogue plus every shipped opt-in folder pack, by its id. */
export const launcherModCatalogue = (
  value: unknown,
  packs: readonly { manifest: { id: string; optIn?: true | undefined } }[],
): { mods: BundledModEntry[]; folderMods: string[] } => {
  const catalogue = {
    mods: bundledModCatalogue(value),
    folderMods: packs.filter(({ manifest }) => manifest.optIn).map(({ manifest }) => manifest.id),
  };
  bundledModCatalogue(catalogue);
  return catalogue;
};
