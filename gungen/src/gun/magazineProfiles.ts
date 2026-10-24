import {
  finite,
  getDotPath,
  type InferOutput,
  integer,
  minValue,
  nonEmpty,
  number,
  pipe,
  record,
  safeParse,
  strictObject,
  string,
} from 'valibot';
import content from './magazines.json' with { type: 'json' };

const Units = pipe(number(), finite(), minValue(Number.MIN_VALUE));
const Text = pipe(string(), nonEmpty());
const ProfileSchema = strictObject({
  photo: Text,
  scale: Text,
  depthU: Units,
  bodyLengthU: Units,
  widthU: Units,
  capacity: pipe(number(), integer(), minValue(1)),
});
const ContentSchema = strictObject({ profiles: record(Text, ProfileSchema) });

type MagazineProfileContent = InferOutput<typeof ProfileSchema>;

/** Checks the authored box magazines; a malformed one is a build error naming its field. */
const loadMagazineProfiles = (raw: unknown): Readonly<Record<string, MagazineProfileContent>> => {
  const parsed = safeParse(ContentSchema, raw);
  if (!parsed.success) {
    throw new Error(
      `Magazine content: ${parsed.issues.map((issue) => `${getDotPath(issue) ?? '(root)'}: ${issue.message}`).join('; ')}`,
    );
  }
  return parsed.output.profiles;
};

/** Photo-measured straight box magazines, by profile name. */
export const MAGAZINE_PROFILES = loadMagazineProfiles(content);

export const magazineProfileContent = (profile: string | undefined): MagazineProfileContent | undefined =>
  profile !== undefined && Object.hasOwn(MAGAZINE_PROFILES, profile) ? MAGAZINE_PROFILES[profile] : undefined;
