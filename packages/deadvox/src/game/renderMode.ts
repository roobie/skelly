export const renderFreeFromUrl = (params: URLSearchParams, development: boolean): boolean =>
  development && params.get('bench') === null && params.get('render') === '0';
