export const loadPlaytestText = async (fetcher, url, language) => {
  try {
    const response = await fetcher(url);
    if (!response.ok) {
      return null;
    }
    const catalog = await response.json();
    const text = catalog?.[language];
    if (text && typeof text === 'object' && !Array.isArray(text)) {
      return text;
    }
    return null;
  } catch {
    return null;
  }
};
