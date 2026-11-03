import type { Registry } from '../../src/core/content.ts';

export const shortFirearmStart = (registry: Registry, site?: string) => {
  const start = [...registry.starts.values()].find(
    (row) =>
      row.debugOnly &&
      (site === undefined || row.site === site) &&
      row.kit.some(({ item }) => {
        const definition = registry.items.get(item);
        const model = registry.models.get(definition?.model ?? '');
        return (
          definition?.firearm && model?.hands?.support && !model.hands.butt && model.gun?.action?.triggerMode === 'semi'
        );
      }),
  );
  if (!start) {
    throw new Error('Fixture requires an authored debug start with a short semi-automatic firearm');
  }
  return start;
};
