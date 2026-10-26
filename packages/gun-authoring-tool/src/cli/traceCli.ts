import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

export const positiveArgument = (raw: string, flag: string): number => {
  const value = Number(raw);
  if (!(Number.isFinite(value) && value > 0)) {
    throw new Error(`${flag} must be a positive finite number`);
  }
  return value;
};

export const photoDataUrl = (path: string): string => {
  const mime = (
    { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' } as Record<
      string,
      string
    >
  )[extname(path).toLowerCase()];
  if (!mime) {
    throw new Error('Photo must be PNG, JPEG or WebP');
  }
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`;
};
