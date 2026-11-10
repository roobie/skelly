/** Why practice replaces other starts: `packages/deadvox/docs/url-mods.md`, "Committed scenarios". */
export const tutorialUrl = (
  href: string,
  practiceMod: string,
  packs: readonly { id: string; defaultStart?: unknown }[],
  keptHash = '',
): string => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  const render = url.searchParams.get('render');
  if (render !== null) {
    presentation.set('render', render);
  }
  const mods = (url.searchParams.get('mods') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && id !== '1' && id !== practiceMod);
  const startPacks = new Set(packs.filter(({ defaultStart }) => defaultStart !== undefined).map(({ id }) => id));
  for (const id of new Set(mods)) {
    if (startPacks.has(id)) {
      // biome-ignore lint/suspicious/noConsole: replacing a start must be visible to its developer or mod author.
      console.warn(`Practice link removed start pack "${id}"`);
    }
  }
  presentation.set('mods', [...mods.filter((id) => !startPacks.has(id)), practiceMod].join(','));
  url.search = presentation.toString();
  url.hash = keptHash;
  return url.href;
};
