---
read_if:
  - you check actor terrain bashing by eye
  - you change actor terrain strength, blow kind or support cascades
---

# Actor breach look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.actor-breach-look#{debug:true}).

At noon, a shambler stands behind a timber wall span and a brute shambler behind a masonry wall span, with the player in sight. The timber wall carries a timber overhang. Every skill is at its top level from the fixture start kit.

## Check

1. Watch the shambler remain behind the timber wall while the brute breaks through masonry.
2. After a wall falls, leave the rubble in place. Ordinary actor blows do not clear it.
3. Use the debug build tool to remove a timber wall cell under the overhang and confirm unsupported cells fall as rubble.
