---
read_if:
  - you check actor terrain bashing by eye
  - you change actor terrain strength, blow kind or support cascades
---

# Actor breach look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.actor-breach-look#{debug:true}).

At noon, a shambler and a brute shambler stand behind separate one-cell walls, one timber and one masonry, with the player in sight. Every skill is at its top level from the fixture start kit.

## Check

1. Watch the shambler remain behind its timber wall and the brute break its masonry wall.
2. After a wall falls, leave the rubble in place. Ordinary actor blows do not clear it.
3. Use the debug build tool to remove a cell holding any overhang and confirm unsupported cells fall as rubble.
