---
read_if:
  - you review the shelter plot's breach, condition, room access or repairs by eye
  - you compare the damaged shelter with its shared intact rural plot
---

# Shelter condition look

Open `/?start-mod=skelly.deadvox.scenario.holdout.condition-look#{debug:true}`.
For repair persistence, use HTTPS and add `save:true` to the hash.

The isolated comparison avoids waves and supply trips so review time goes to the
architecture and repair invitation. The fixture starts beside the breach and uses
the shared review kit's top-level skills. Its intact comparison separates deliberate
missing geometry from condition damage; seeded window and door alternatives still
belong to the ordinary building kit. See `condition-look.jsonnet` and
`tools/jsonnet/lib/start-kit.libsonnet`, `fixture`.

Judge whether the broken wall and roof read as one breach, whether the bearing
partitions leave the house usable, and whether remaining frames and cracked surfaces
make repair targets clear. Check room and yard approaches on foot, not by teleporting
past an obstruction. Repair a damaged timber floor or lintel through its work review;
after Save and Continue, the repair should persist without changing untouched
condition. The shared repair recipes do not promise repair for every wall material.
No setup or waiting for enemies is part of this check.

The shared building kit owns geometry and condition choices. See
`packages/deadvox/mods/skelly.deadvox.buildings/rural-damaged.jsonnet`, `breachedHouse`
and `condition`, and `packages/deadvox/docs/holdout.md`, "Shelter plot".
