import type { ModelDef, Registry } from './content.ts';

const bandIssues = (bands: readonly { readonly from: number }[]): string[] =>
  bands[0]?.from !== 0 || bands.some((band, index) => index > 0 && band.from <= bands[index - 1]!.from)
    ? ['bands must start at zero and increase strictly']
    : [];

const modelIssues = (registry: Registry, model: ModelDef): string[] => {
  const presentation = model.itemPresentation;
  if (!presentation) {
    return [];
  }
  const issues: string[] = [];
  const wear = registry.itemWear.get(presentation.wear);
  if (!wear) {
    issues.push(`no item wear look "${presentation.wear}"`);
  }
  for (const material of presentation.materials) {
    if (wear?.bands.some((band) => !Object.hasOwn(band.tints, material))) {
      issues.push(`wear band has no tint for material class "${material}"`);
    }
  }
  if (presentation.supply.kind === 'fill') {
    issues.push(...bandIssues(presentation.supply.bands));
  }
  return issues;
};

export const itemPresentationIssues = (
  registry: Registry,
): { id: string; section: 'models' | 'itemWear'; message: string }[] => [
  ...[...registry.itemWear.values()].flatMap((wear) =>
    bandIssues(wear.bands).map((message) => ({ id: wear.id, section: 'itemWear' as const, message })),
  ),
  ...[...registry.models.values()].flatMap((model) =>
    modelIssues(registry, model).map((message) => ({ id: model.id, section: 'models' as const, message })),
  ),
];

interface PresentationAsset {
  readonly materials?: readonly { readonly name?: string }[];
  readonly nodes?: readonly { readonly name?: string }[];
  readonly meshes?: readonly { readonly primitives: readonly { readonly material?: number }[] }[];
}

/** Material indices belong to glTF, including unnamed materials; names alone cannot cover every surface. */
export const modelPresentationAssetIssues = (model: ModelDef, asset: PresentationAsset): string[] => {
  const presentation = model.itemPresentation;
  if (!presentation) {
    return ['model needs explicit item material classes and supply selection'];
  }
  const issues: string[] = [];
  const defaultMaterial = asset.meshes?.some((mesh) =>
    mesh.primitives.some((primitive) => primitive.material === undefined),
  )
    ? 1
    : 0;
  if (presentation.materials.length !== (asset.materials?.length ?? 0) + defaultMaterial) {
    issues.push('every model material must have exactly one wear class');
  }
  if (model.emissiveMaterial && !asset.materials?.some((material) => material.name === model.emissiveMaterial)) {
    issues.push(`no emissive material "${model.emissiveMaterial}"`);
  }
  if (presentation.supply.kind === 'fill') {
    const { piece } = presentation.supply;
    if (!asset.nodes?.some((node) => node.name === piece)) {
      issues.push(`no fill piece "${piece}"`);
    }
  }
  return issues;
};
