/** Events the running game may ask the sound system to play. */
export const SOUND_EVENT_IDS = [
  'player_hurt_light',
  'player_hurt_heavy',
  'player_strain',
  'melee_swing',
  'melee_hit',
  'shambler_idle',
  'shambler_alert',
  'shambler_attack',
  'shambler_hurt',
  'door_open',
  'door_close',
  'door_blocked_close',
] as const;

export type SoundEventId = (typeof SOUND_EVENT_IDS)[number];
