import type { Registry } from './content.ts';

interface BriefIssue {
  section: 'buildingBriefs' | 'mapAssemblies';
  id: string;
  path: string;
  message: string;
}

/** A brief's setting, settlement kinds and styles resolve, and an assembly's brief exists. */
export const buildingBriefIssues = (registry: Registry): BriefIssue[] => {
  const issues: BriefIssue[] = [];
  for (const brief of registry.buildingBriefs.values()) {
    const report = (path: string, message: string) =>
      issues.push({ section: 'buildingBriefs', id: brief.id, path, message });
    const setting = registry.worldSettings.get(brief.setting);
    if (!setting) {
      report('.setting', `no world setting "${brief.setting}"`);
    }
    brief.eligibility.settlementKinds.forEach((kind, index) => {
      if (setting && !setting.settlementKinds.includes(kind)) {
        report(
          `.eligibility.settlementKinds[${index}]`,
          `world setting "${setting.id}" has no settlement kind "${kind}"`,
        );
      }
    });
    brief.styles.forEach((style, index) => {
      if (!registry.mapStyles.has(style)) {
        report(`.styles[${index}]`, `no map style "${style}"`);
      }
    });
  }
  for (const assembly of registry.mapAssemblies.values()) {
    if (assembly.brief !== undefined && !registry.buildingBriefs.has(assembly.brief)) {
      issues.push({
        section: 'mapAssemblies',
        id: assembly.id,
        path: '.brief',
        message: `no building brief "${assembly.brief}"`,
      });
    }
  }
  return issues;
};
