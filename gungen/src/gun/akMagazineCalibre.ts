export const AK_MAGAZINE_CALIBRE_BY_VARIANT = {
  ak74: '5.45x39',
  akm: '7.62x39',
} as const;

export type AkMagazineVariant = keyof typeof AK_MAGAZINE_CALIBRE_BY_VARIANT;

export const AK_MAGAZINE_VARIANT_BY_CALIBRE = {
  '5.45x39': 'ak74',
  '7.62x39': 'akm',
} as const satisfies Readonly<Record<(typeof AK_MAGAZINE_CALIBRE_BY_VARIANT)[AkMagazineVariant], AkMagazineVariant>>;
