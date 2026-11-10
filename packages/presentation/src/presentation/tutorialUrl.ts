export const tutorialRequested = (params: URLSearchParams): boolean =>
  params.get('tutorial') === '1' || params.get('site') === 'tutorial';

/** The page entering or leaving practice; the product passes the hash text practice keeps. */
export const tutorialUrl = (href: string, practice: boolean, keptHash = ''): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  for (const name of ['render', 'save-backend', 'mods']) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      presentation.set(name, value);
    }
  }
  const site = url.searchParams.get('site');
  if (site !== null && site !== 'tutorial') {
    presentation.set('site', site);
  }
  url.search = presentation.toString();
  url.hash = keptHash;
  if (practice) {
    url.searchParams.set('tutorial', '1');
  }
  return url.href;
};
