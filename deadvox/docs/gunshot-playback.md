---
read_if:
  - you change gunshot playback, voice stealing or the player's listener-relative cue
  - you change automatic-fire trigger sampling or shot deadlines
---

# Gunshot playback and automatic fire

## Playback

Every accepted shot selects its seeded variant and starts when the shared load resolves. Pending fetch/decode work does not occupy a playback voice. A new shot fades out the oldest full voice rather than dropping the trigger; retiring tails are bounded, and pathological bursts may shorten the oldest tail to enforce the source ceiling. Cleanup is idempotent so a late end callback cannot release a replacement voice. Actual cadence and clicks still require listening.

The player's firearm cue is listener-relative, so movement cannot leave it behind at the firing position. It retains the gunshot's world-volume category; other actors remain world-positional by default. Exact preview playback is listener-relative too. Footsteps and melee remain world-positioned; this gunshot-only policy does not change them.

Playback modules are presentation and stay outside save identity. `src/core/soundPicker.ts` remains simulation state because its seeded choice, cooldown and hearing admission affect the world. See `src/game/audio.ts`, `GameAudio`, and `src/game/audioPresentation.ts`, `firearmShotSound`.

## Automatic fire

A ready automatic firearm repeats only on its held dominant-use route; other item actions remain edge-triggered, and off-hand firearm use is a single shot. Shot deadlines derive from burst start and shot index, not accumulated frame rounding or wall-clock timers. Every deadline owns a deterministic case seed and sound pick. A short click between ticks still fires once; menus, build mode and inactive input reset the burst. Held trigger state is transient and is not resumed from a save. See `src/game/player.ts`, `MoveIntent`, and `src/game/firearmTrigger.ts`, `FirearmTrigger`.

The exported rpm and a chambered cartridge govern firing. Presentation starts at the player-tick boundary and, on a cold sample, after decoding; this is not sample-accurate wall-clock playback. See `src/game/firearmTrigger.ts`, `FirearmTrigger`, and `src/game/firearmHandling.ts`, `firearmHandlingFor`.
