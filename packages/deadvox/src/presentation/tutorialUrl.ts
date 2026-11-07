export const tutorialRequested = (params: URLSearchParams): boolean =>
  params.get('tutorial') === '1' || params.get('site') === 'tutorial';

export const tutorialUrl = (href: string, practice: boolean): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  for (const name of ['render', 'radius', 'actors', 'save-backend', 'mods']) {
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
  url.hash = '';
  if (practice) {
    url.searchParams.set('tutorial', '1');
  }
  return url.href;
};
