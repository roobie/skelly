---
read_if:
  - you design, change or run the principles review of a PR
  - you review a PR or self-check one before pushing
  - you add a pillar, principle or engineering rule that reviews should apply
---

# Principles review skill (draft)

A draft for an agent skill that checks a PR against the project's pillars,
principles, guidelines and engineering rules. It goes through several passes
before the skill itself is written.

## Why

A correctness review checks a change against its brief. It misses a broken
principle that the brief didn't name. PR #592's bleeding tiers had two review
SHIPs while the code still hard-coded which tier stops by itself, which tier
has a region rule, and the `bandage` and `rag` treatments. Content should have
decided all of them. The pillars only got applied when someone remembered them.
A skill makes that lens routine.

## Shape: one skill, several lenses

One skill, one entry point and one report shape. Each lens can be skipped as not
relevant: a docs-only PR skips the player view.

Separate skills multiply tokens per review, and a reviewer picks some and
forgets the rest.

Lenses:

1. **Principles:**
   - content forward compatibility (r74, once its owner doc lands);
   - no backwards compatibility at this stage (AGENTS.md);
   - maintainability over short-term churn (README "Pillars");
   - no host-specific information (AGENTS.md).
2. **Zero drift and docs:**
   - code cues instead of copies, and no amendment trails;
   - `read_if` front matter;
   - the reason recorded in a tracked doc before merge (README "Zero drift", AGENTS.md).
3. **Test hygiene** (AGENTS.md "Tests"): already must-fix.
4. **BR's rulings:**
   - does the change match what BR ruled;
   - are the rulings quoted in commit messages, not docs?
5. **Player view** (optional): does it change what BR sees, and so need a look?

## Design rules

1. **It cites; it doesn't copy.** Each lens names the owning doc and section, and
   the skill reads the rule from there at review time, so it can't drift from the
   rules. This is zero drift applied to the skill itself.
2. **Mechanical checks go to scripts.** Anything a script can catch belongs in a
   checker or lint, not in a model's attention: content-id literals in code,
   closed unions of content values, host paths. The skill covers what needs
   judgement.
3. **Each finding names its lens and the rule it breaks,** so a FIX is traceable
   and can be argued with.
4. **Coders run it too, before pushing,** in a lighter self-check form, so fewer
   issues reach review. It is plain markdown that any agent can read, not tied
   to one agent harness.

## Open questions

- Should it run on every review, or only on PRs past a size or risk threshold?
  The lead suggests every review, with lenses skipped by relevance, because the
  #592 miss was a mid-sized PR.
- Who writes the skill? A reviewer-first pass like r74 fits, and it needs r74's
  rule settled first.
- Other lenses: performance budgets, save-format impact (from v1.0 beta),
  accessibility?
- Where does the skill live so that every agent can use it: a tracked
  `.claude/skills/` entry, a doc under `docs/`, or both?
