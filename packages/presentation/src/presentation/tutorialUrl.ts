/**
 * The page entering or leaving practice. Practice is a scenario picked through `mods`, so entering adds the practice
 * mod after the page's own mods, whose start then begins the run, and leaving drops it. The product passes that mod's
 * id and the hash text practice keeps.
 */
export const tutorialUrl = (
  href: string,
  practiceMod: string | undefined,
  practice: boolean,
  keptHash = '',
): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  for (const name of ['render', 'save-backend']) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      presentation.set(name, value);
    }
  }
  const mods = (url.searchParams.get('mods') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && id !== '1' && id !== practiceMod);
  if (practice && practiceMod !== undefined) {
    mods.push(practiceMod);
  }
  if (mods.length > 0) {
    presentation.set('mods', mods.join(','));
  }
  url.search = presentation.toString();
  url.hash = keptHash;
  return url.href;
};
