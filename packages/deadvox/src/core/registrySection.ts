import type { ContentSection } from './schema/files.ts';

export const registrySection = <S extends ContentSection>(section: S): S extends 'actors' ? 'zombies' : S =>
  (section === 'actors' ? 'zombies' : section) as S extends 'actors' ? 'zombies' : S;
