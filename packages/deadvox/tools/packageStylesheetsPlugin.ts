// biome-ignore lint/correctness/noNodejsModules: Vite build-time plugin, never imported by the product.
import { dirname, relative } from 'node:path';
import type { IndexHtmlTransformContext, Plugin, ResolvedConfig } from 'vite';

const PACKAGE_STYLESHEET = /<link rel="stylesheet" href="(@skelly\/[^"]+)" \/>/g;

/**
 * Pages link the presentation package's style sheets by package specifier, so each sheet stays the package's file
 * and still blocks the first paint: a style sheet imported from the page's module waits for the module graph in the
 * dev server, and the page paints unstyled until then. Neither the dev server nor the build resolves a package
 * specifier in a link, so this rewrites it to the resolved file, which the dev server serves through its
 * file-system route and the build bundles as the page's own style sheet.
 */
export function packageStylesheetsPlugin(): Plugin {
  let resolveFile: (specifier: string, importer: string) => Promise<string | undefined>;
  let serving = false;
  return {
    name: 'skelly:package-stylesheets',
    configResolved(config: ResolvedConfig) {
      const resolver = config.createResolver();
      resolveFile = async (specifier, importer) => resolver(specifier, importer);
      serving = config.command === 'serve';
    },
    transformIndexHtml: {
      order: 'pre',
      async handler(html: string, { filename }: IndexHtmlTransformContext): Promise<string> {
        const specifiers = [...new Set([...html.matchAll(PACKAGE_STYLESHEET)].map((match) => match[1]!))];
        const files = await Promise.all(specifiers.map((specifier) => resolveFile(specifier, filename)));
        const hrefs = new Map(
          specifiers.map((specifier, index) => {
            const file = files[index];
            if (file === undefined) {
              throw new Error(`${filename} links style sheet ${specifier}, which does not resolve`);
            }
            return [specifier, serving ? `/@fs${file}` : relative(dirname(filename), file)];
          }),
        );
        return html.replace(
          PACKAGE_STYLESHEET,
          (_link, specifier: string) => `<link rel="stylesheet" href="${hrefs.get(specifier)}" />`,
        );
      },
    },
  };
}
