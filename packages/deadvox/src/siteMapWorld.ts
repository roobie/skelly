const MAX_STOREYS = 20;

/**
 * The storeys and density the review map draws, from the map page's own query. Play passes the world it shows; the
 * game reads storeys and density only from its start. An absent or out-of-range value falls back to one storey and the
 * site's own density.
 */
export const mapWorldShape = (params: URLSearchParams): { storeys: number; density: number | null } => {
  const storeys = Number(params.get('storeys') ?? 1);
  const densityText = params.get('density');
  const density = densityText === null || densityText.trim() === '' ? null : Number(densityText);
  return {
    storeys: Number.isInteger(storeys) && storeys >= 1 && storeys <= MAX_STOREYS ? storeys : 1,
    density: density !== null && Number.isFinite(density) && density >= 0 && density <= 1 ? density : null,
  };
};
