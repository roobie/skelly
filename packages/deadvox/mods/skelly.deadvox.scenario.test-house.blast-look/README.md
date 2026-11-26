---
read_if:
  - you check grenade blasts and fragments against terrain and pieces by eye
  - you change `packages/engine/src/game/session.ts`, `detonate`
---

# Blast look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.blast-look#{debug:true}).

A frag grenade is held at noon beside timber and masonry walls, with a crate beyond the masonry. Every skill starts at its top level. The blast rule is in `packages/deadvox/SLICE-5.md`, "Lanes and the next rounds".

## Check

1. Pull the pin and throw the grenade between the walls.
2. Watch the nearer faces crack or break according to their material; the masonry wall resists more than the timber wall at the same reach.
3. The far crate remains behind the masonry until the wall opens. Fragments leave marks only on the first wall face each ray reaches.
4. Save and reload: damage, rubble and any collapsed pieces remain.
