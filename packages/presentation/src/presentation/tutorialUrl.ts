/**
 * The practice page linked from `href`. Practice is a scenario picked through `mods`, so the link adds the practice
 * mod after the page's own mods, whose start then begins the run. It drops the page's `start-mod`, which would
 * otherwise win, and every other setting but the renderer and the hash text the product keeps. Why practice is its
 * own page: `packages/deadvox/docs/tutorial.md`, "Disposable practice".
 */
export const tutorialUrl = (href: string, practiceMod: string, keptHash = ''): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  const render = url.searchParams.get('render');
  if (render !== null) {
    presentation.set('render', render);
  }
  const mods = (url.searchParams.get('mods') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && id !== '1');
  presentation.set('mods', [...mods, practiceMod].join(','));
  url.search = presentation.toString();
  url.hash = keptHash;
  return url.href;
};
