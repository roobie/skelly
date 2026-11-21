---
read_if:
  - you review Holdout's generated shelter damage, panes or cell repair by eye
---

# Shelter condition look

Open `/?start-mod=skelly.deadvox.scenario.holdout.condition-look#{debug:true,save:true,at:[5,10,0]}`.

The production shelter stands at the start, without waves or a supply trip. The backpack has repair tools and stock; all skills are at their top level.

1. Cracks are visible on the standing brickwork. The deliberate breach is still a gap, not a condition effect.
2. Windows retain their frames; low-condition panes are broken, not empty holes without frames.
3. Aim at cracked brickwork and choose Repair. Review and Start the work. Its cracks recede as condition improves.
4. Save and Continue over HTTPS. Repairs persist, and untouched walls keep their condition. Travel away and return: repaired cells do not regain their generated damage.

The content owns the shelter's condition and pane threshold, so seeds may differ without changing the check. See `packages/deadvox/mods/skelly.deadvox.scenario.holdout/holdout-house.libsonnet`, `condition`.
