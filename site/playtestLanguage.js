const choosePlaytestLanguage = (languages, search) => {
  const override = new URLSearchParams(search).get('lang');
  if (override === 'sv' || override === 'en') {
    return override;
  }

  const firstTagIndex = (prefix) => languages.findIndex((tag) => new RegExp(`^${prefix}(?:-|$)`, 'i').test(tag));
  const swedishIndex = firstTagIndex('sv');
  const englishIndex = firstTagIndex('en');
  return swedishIndex >= 0 && (englishIndex < 0 || swedishIndex < englishIndex) ? 'sv' : 'en';
};

export const applyPlaytestLanguage = (languages, search) => choosePlaytestLanguage(languages, search);
