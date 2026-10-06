const ANALYTICS_SCRIPT = '<script async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>';

export const pagesAnalyticsPlugin = (enabled: boolean) => ({
  name: 'skelly:pages-analytics',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    if (!enabled) {
      return html;
    }
    if (!html.includes('</head>')) {
      throw new Error('Pages analytics requires a closing </head> tag');
    }
    return html.replace('</head>', `  ${ANALYTICS_SCRIPT}\n</head>`);
  },
});
