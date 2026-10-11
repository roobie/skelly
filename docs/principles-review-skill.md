---
read_if:
  - you design, change or run the principles review of a PR
  - you review a PR or self-check one before pushing
  - you add a pillar, principle or engineering rule that reviews should apply
---

# Principles review skill (draft)

A proposed harness-neutral skill that checks a PR against the project's pillars,
principles and engineering rules. It complements correctness review; it does not
replace it or grant approval to merge.

## Why

A correctness review checks a change against its brief. It can miss a broken
principle that the brief didn't name, including code that owns decisions which
belong to content. Making the principles lens routine avoids relying on a
reviewer to remember it.

## Shape: one skill, several lenses

One skill, one entry point and one report shape. Run it alongside every
correctness review. Consider every lens, scaling inspection depth to the change,
not skipping coverage because a PR is small. Separate skills multiply context
and make it easier to forget a lens.

Each lens cites its owning doc and section; read the rule there at review time
instead of maintaining a second copy in the skill:

1. **Principles:** `README.md`, "Pillars"; `AGENTS.md`, "Project stage",
   "No host-specific information in tracked files" and "Dependency age".
   Content forward compatibility awaits r74's settled rule and owner document.
2. **Zero drift and docs:** `README.md`, "Zero drift"; `AGENTS.md`, "Zero drift".
3. **Test hygiene:** `AGENTS.md`, "Tests" and "Before pushing: tiered checks".
4. **BR's rulings:** the applicable topic's owner documents;
   `docs/PROCESS.md`, "Recording decisions". Check implementation against the
   settled ruling and its provenance, not against an inferred preference.
5. **Player impact and approval gates:** `docs/PROCESS.md`, "Reviews by eye and
   by play", "Slice decision rules" and "The life of a change". Docs-only work
   is not automatically exempt: control guidance can affect play.

## Scope and inspection

Review violations introduced or materially worsened by the change, including
its affected consumers outside the diff. Report unrelated existing problems
separately; this is not a repository-wide audit.

Follow changed decisions through their owners, callers and secondary consumers.
Ask whether adding another content value requires editing code that should
merely interpret content. Apply `docs/PROCESS.md`, "Continuous consolidation",
when assessing ownership and duplicated decisions; a diff-only checklist can
miss the wrong authority surviving elsewhere.

Delegate unambiguous patterns to scripts. Content-id literals and closed unions
are not inherently violations: fixtures and structural discriminants may
legitimately use them. Judgement determines whether code owns a decision that
belongs to content. A passing checker is evidence only for the constraint it
checks, not proof of principle compliance.

Coders run the same lenses before pushing. Self-check uses the same rules and
finding contract with less reporting overhead, not weaker standards.

## Findings and completion

Each finding states:

- its lens and the owning rule, cited by path and section;
- evidence at the affected path and symbol, showing the concrete violation;
- the consequence and smallest adequate correction.

Apply `AGENTS.md`, "Tests", for the FIX threshold: actual defects and test-hygiene
failures block; improvements and style preferences remain nonblocking. Keep the
review verdict and cause reporting consistent with `docs/PROCESS.md`, "Slice
decision rules", rather than inventing a second verdict system.

The report identifies the reviewed base and head and marks every lens as
assessed, not applicable with a reason, or not assessed with the missing evidence
or dependency. Not assessed is never a pass. An applicable rule whose evidence
is missing leaves the principles review incomplete, even if no defect has yet
been demonstrated.

Report an outstanding BR approval as an open gate, not approval the reviewer can
grant. A completed principles review does not substitute for correctness review,
CI or BR's verdict; merge conditions remain owned by `docs/PROCESS.md`, "The life
of a change".

## Canonical home

Keep one tracked, harness-neutral skill document under `docs/`. Add thin
harness-specific entry points only if needed; they point to the canonical text
rather than copy its instructions. This gives every agent the same review
contract without creating competing rule owners.

## Unresolved dependencies

- **r74:** settle content forward compatibility and cite its owner document before
  that lens can be assessed. Distinguish supporting additional authored values
  from preserving old schemas or saves; it must not silently introduce a
  backwards-compatibility obligation. Until settled, report this part of the
  principles lens as not assessed when content extensibility is relevant.
- **Additional lenses:** identify an applicable project rule and its owner before
  adding performance, accessibility or other checks. The skill applies settled
  rules; it does not create policy through review findings.
