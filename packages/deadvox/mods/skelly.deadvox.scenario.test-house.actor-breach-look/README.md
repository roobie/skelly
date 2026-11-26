---
read_if:
  - you check actor terrain bashing by eye
  - you change actor terrain strength, blow kind or support cascades
---

# Actor breach look

Open the [fixture](/?start-mod=skelly.deadvox.scenario.test-house.actor-breach-look#{debug:true}).

At noon you face a brute shambler shut in a brick pocket, with a shambler shut in a timber pocket to your right. Neither pocket has a way around. Each actor sees you through a low slot in its front wall that neither can climb through. The brick wall facing you starts nearly broken, so the brute's breach takes seconds instead of minutes; the strength gate still decides whether a blow lands. A timber beam juts towards you from the top of the timber pocket's front wall, held only by that top cell. Every skill is at its top level from the fixture start kit.

## Check

1. Without moving, watch the shambler stay behind its timber wall, its blows leaving no mark, while the brute breaks through the brick and comes for you.
2. Use the debug build tool to remove the top wall cell the beam juts from. The beam falls to the floor as rubble, and the rubble stays there.
