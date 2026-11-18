const KEPT_SWITCHES = ['render', 'play-test', 'save-test'] as const;

/** Why practice replaces other starts and keeps these switches: `packages/deadvox/docs/url-mods.md`, "Committed scenarios". */
export const tutorialUrl = (
  href: string,
  practiceMod: string,
  packs: readonly { id: string; defaultStart?: unknown }[],
  keptHash = '',
): { href: string; droppedPacks: string[] } => {
  const url = new URL(href);
  const presentation = new URLSearchParams();
  for (const name of KEPT_SWITCHES) {
    const value = url.searchParams.get(name);
    if (value !== null) {
      presentation.set(name, value);
    }
  }
  const mods = (url.searchParams.get('mods') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '' && id !== '1' && id !== practiceMod);
  const startPacks = new Set(packs.filter(({ defaultStart }) => defaultStart !== undefined).map(({ id }) => id));
  const droppedPacks = [...new Set(mods.filter((id) => startPacks.has(id)))];
  presentation.set('mods', [...mods.filter((id) => !startPacks.has(id)), practiceMod].join(','));
  url.search = presentation.toString();
  url.hash = keptHash;
  return { href: url.href, droppedPacks };
};

const PRACTICE_WARNINGS_KEY = 'skelly.practice-link-warnings';
type PracticeWarningStore = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const stagePracticeLink = (link: ReturnType<typeof tutorialUrl>, stash: PracticeWarningStore): string => {
  if (link.droppedPacks.length > 0) {
    try {
      stash().setItem(PRACTICE_WARNINGS_KEY, JSON.stringify(link));
    } catch {
      for (const id of link.droppedPacks) {
        // biome-ignore lint/suspicious/noConsole: blocked storage must not prevent practice navigation or silence its warning.
        console.warn(`Practice link removed start pack "${id}"`);
      }
    }
  }
  return link.href;
};

/** The destination owns the warning because navigation clears the departing page's console. */
export const logPracticeWarnings = (href: string, stash: PracticeWarningStore): void => {
  let pending: unknown;
  try {
    const store = stash();
    const text = store.getItem(PRACTICE_WARNINGS_KEY);
    store.removeItem(PRACTICE_WARNINGS_KEY);
    pending = text === null ? undefined : JSON.parse(text);
  } catch {
    // A browser that blocks session storage has no readable handoff.
    return;
  }
  if (typeof pending !== 'object' || pending === null || !('href' in pending) || pending.href !== href) {
    return;
  }
  if (!('droppedPacks' in pending && Array.isArray(pending.droppedPacks))) {
    return;
  }
  for (const id of pending.droppedPacks) {
    if (typeof id === 'string') {
      // biome-ignore lint/suspicious/noConsole: replacing a start must be visible to its developer or mod author.
      console.warn(`Practice link removed start pack "${id}"`);
    }
  }
};
