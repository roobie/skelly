const PRACTICE_SITE = 'tutorial';

/** `tutorial=1` enters the practice site while `site` keeps the player's own site for the return. */
export const practiceEntry = (params: URLSearchParams): URLSearchParams => {
  if (params.get('tutorial') !== '1') {
    return params;
  }
  const entry = new URLSearchParams(params);
  entry.set('site', PRACTICE_SITE);
  entry.delete('start');
  return entry;
};

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
  if (site !== null && site !== PRACTICE_SITE) {
    presentation.set('site', site);
  }
  url.search = presentation.toString();
  url.hash = '';
  if (practice) {
    url.searchParams.set('tutorial', '1');
  }
  return url.href;
};
