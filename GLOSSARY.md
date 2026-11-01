---
read_if:
  - a term in a doc, card or review is ambiguous
  - you're about to grade options by tech debt
  - you distinguish entity identity, actors, control roles and persistent characters
---

# Glossary

Shared terms keep grades and rulings comparable across agents and reviews.

**Tech debt**

The future cost of rework and maintenance that comes from choosing a quick, easy or
temporary fix in place of a complete, high-quality solution. It accrues interest: the
longer the underlying fix waits, the slower, harder and costlier later changes become.

The cost to build something is not tech debt.

## Actor roles

These terms distinguish ownership rather than species or product. Keeping control,
identity and persistent persona separate avoids making the player the only kind of
actor a mechanism can address.

- **Entity:** a stored identity.
- **Actor:** a source of effects or behavior, including the source whose modifiers
  resolve an effect (`PILLARS.md`, "Content forward compatibility").
- **Player:** a control role.
- **Character:** a persistent persona.
- **Agent:** an autonomous decision controller.

These roles do not decide whether a ship is an actor; that remains a mechanism-design
question under #1532.
