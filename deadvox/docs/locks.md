---
read_if:
  - you change door-lock content, forcing, interaction or save ownership
  - you use the `lock_test` first-look fixture
---

# Minimal door locks

Locks belong to their doors rather than procedural placement ids, so authored keys can fit doors across composed sites. Forced entry destroys the lock: a breach is a one-way choice, not another way to unlock and relock. See `src/core/blockEntities.ts`, `BlockEntities`, and `src/core/schema.ts`, `FurnitureSchema`.

How a door yields follows from its material and its own resistance. Material admission prevents an individual door from bypassing the material's rules; resistance belongs to each door so stronger leaves can demand better tools and longer work. The quiet key route trades against the noisy forcing route. The fallback needs the door's forcing tool, not always the crowbar, so finding that tool is part of the trade. See `src/core/content.ts`, `referenceIssues`, `src/core/prying.ts`, `pryPlan`, and `src/core/longAction.ts`, `LongActions.beginForcing`.

Every door will be bashable given enough strength. Bashing waits because neither actor strength nor door strength is modelled. Cutting a wooden door will start a fire, so wood offers no cut method until a fire model exists.

Use the `lock_test` site for a first look without depending on a loot roll. See `src/content/base/locks.libsonnet`. Save shape changes have no migration path before compatibility is owed; see `AGENTS.md`, "Project stage: pre-pre-alpha, no backwards compatibility".
