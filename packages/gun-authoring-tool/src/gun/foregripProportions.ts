/**
 * A vertical foregrip sized for a hand: about 90 mm of grip below the rail, about 35 mm across and deep,
 * so it reads as a hand-filling post against the AK's lower handguard (3 u wide) rather than a stub.
 */
export const FOREGRIP_PROPORTIONS = {
  /** The foot clamped on the rail. */
  foot: { halfLengthU: 1, halfWidthU: 0.75, heightU: 1 },
  grip: { halfLengthU: 1.5, halfWidthU: 1.5, lengthU: 8 },
} as const;
