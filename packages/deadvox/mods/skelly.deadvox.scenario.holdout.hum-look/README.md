---
read_if:
  - you review by ear and by eye how a running plant module's hum draws a Holdout wave
  - you change how hordes hear world sounds, or a module's hum, and need a check that stages both
---

# Holdout hum look

Open `/?start-mod=skelly.deadvox.scenario.holdout.hum-look#{debug:true}`.

The look stands Holdout's own plant alone, with its module producing from the start, so the check spends no time on a
restoration; see `running-plant.jsonnet`. Holdout's first wave keeps its authored horde and comes within a minute, as in
the Holdout debug look. Its release point stays inside the reach at which the wave hears the hum through a wall, so
whichever edge the wave appears at, the hum is what it follows; see `starts.jsonnet`, `reach`, and
`packages/deadvox/test/holdoutHumLook.test.ts`. The site authors one module, so the look shows one source.

No debug overlay draws a horde's target, so the wave's path is the readout. The debug panel's sound log is a history
of recently started sounds, not a list of what plays now: a stopped hum can stay listed, and a running one can drop
out as other sounds fill it. Use it only to see that the hum started; whether the module runs is the audible hum and
the lamp.

1. Hum: the player starts at the plant's door with the module running and the lamp beside it lit. Walk to the module:
   the hum grows louder. Step back out of the door and around the wall: it fades and muffles. The sound log shows the
   hum started.
2. Drawn wave: wait inside the plant, out of sight of the door. The wave appears at the edge of the site and walks to
   the plant. Once there, if no member sees you, it gets used to the hum and strays around the plant; the hum no longer
   draws it, but a new sound, such as a shout, still does.
3. Committed approach: while the wave is still walking in, aim at the lever below the module's dial and press F. The
   lever drops to OFF, the lamp goes dark and the hum stops. The wave keeps coming to
   the spot it last heard.
4. Due wave without a hum: open the link again and switch the module off at once, before the wave is due. The plant
   stays silent, and the wave still arrives when due.
