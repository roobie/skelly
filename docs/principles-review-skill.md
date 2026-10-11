---
read_if:
  - you write or run a code review (cr-*) and need its principles section
  - you add a pillar, principle or engineering rule that code reviews should apply
  - you change review verdicts, FIX causes or what blocks a merge on principle
---

# Principles review skill (draft)

A proposed harness-neutral skill: the principles section that every code review
(cr-*) includes. It checks a change against the project's pillars, principles and
engineering rules, inside the code review's single verdict.

## Why

`docs/PROCESS.md`, "The life of a change", step 4, already has the code review
check zero drift, and "Continuous consolidation" asks every review to name the
ownership or duplicated decision and to review callers and secondary consumers.
The gap is in how those rules are applied: from memory, with no list of which
rules apply, so a review can skip one and nobody sees it. Content-versus-code
ownership is the easiest to skip: outside deadvox's own pillars it has no settled
rule until r74. Listing every lens with its owner, and reporting a status for
each, makes a skipped lens visible.

## Shape: a required section of the code review

The lenses are a required section of the code review, not a separate pass. There
is one review, one verdict and one owner, so the principles section can't
disagree with the review it sits in. Consider every lens, scaling inspection
depth to the change; a small PR doesn't skip coverage.

Each lens cites its owning doc and section. Read the rule there at review time;
the skill keeps no second copy.

1. **Engineering pillars and repository rules:** `README.md`, "Pillars", "Static
   analysis" and "Maintainability"; `AGENTS.md`, "Project stage", "No
   host-specific information in tracked files" and "Dependency age".
2. **Subproject pillars and content ownership:** each subproject's own pillars,
   such as `deadvox/DESIGN.md`, "Pillars", whose "Depth through data" covers
   deadvox code that owns a decision belonging to content; for performance,
   `deadvox/DESIGN.md`, "Reference hardware"; for authored data, `docs/jsonnet.md`,
   its opening rule and "Team rules"; and `docs/PROCESS.md`, "Continuous
   consolidation", for ownership and duplicated decisions.
3. **Zero drift and docs:** `README.md`, "Zero drift"; `AGENTS.md`, "Zero drift";
   `docs/PROCESS.md`, "The life of a change", step 4.
4. **Tests:** `AGENTS.md`, "Tests". From "Before pushing: tiered checks", a review
   checks what it can see: a red CI job is fixed in the next push, and no
   `--no-verify` push went over a real failure.
5. **BR's rulings:** the topic's owner documents; `docs/PROCESS.md`, "Recording
   decisions". Check the change against the settled ruling and its provenance (the
   verbatim quote and stamp in the commit), not against an inferred preference.
6. **Player impact and approval gates:** `docs/PROCESS.md`, "Reviews by eye and by
   play", "Slice decision rules" and "The life of a change". A change with no code
   isn't exempt when it changes what the player sees or reads, such as item
   descriptions or controls help.

Out of scope: `docs/git-workflow.md` and `AGENTS.md`, "Work item IDs". The lead
checks them when opening and merging a PR.

## Scope and inspection

Review violations the change introduces or extends; a new instance of an existing
violation counts. Report unrelated existing problems separately; this is not a
repository-wide audit.

Follow each changed decision one call or import hop past its owner, and to every
consumer of a changed content field. A changed shared schema, registry or
exported type is followed to every consumer. A generated file is reviewed through
its source, such as compiled JSON through its Jsonnet (`docs/jsonnet.md`). Ask
whether adding another content value
would need an edit to code that should only interpret content.

Delegate unambiguous patterns to scripts. A passing checker is evidence only for
the constraint it checks, not for the principle. Content-id literals and closed
unions are not violations by themselves: fixtures and structural discriminants
may use them. When r74's owner doc lands, its allowlist decides which closed lists
may stay.

Coders don't run the skill as a pre-push check; `AGENTS.md`, "Before pushing:
tiered checks", lists none. Add one only if reviews show misses a coder could have
caught, and list it there.

## Findings and verdict

The code review gives one verdict, in a report with these fields in this order:

```text
VERDICT: SHIP or FIX
Cause:          (FIX only)
Consolidation:
Reviewed:       <base>..<head>
Lenses:         one status for each of the six
FINDINGS
Nits
FOR THE LEAD:   CI on the head; merge-tree against main
```

`Cause:` takes its format from `docs/PROCESS.md`, "Slice decision rules", "FIX
causes", and `Consolidation:` from "Continuous consolidation". A lens's status is
one of:

- **assessed;**
- **not applicable**, with the reason;
- **not assessed**, only when the lens's rule isn't settled yet; the report names
  the item that settles it (r74). This never blocks the merge, and the lens is
  listed as open.

Each finding states:

- its lens and the owning rule, cited by path and section;
- evidence at the affected path and symbol;
- the consequence and the smallest adequate correction.

Evidence for a behaviour claim is a reproducing probe, a mutant or a base A/B
where one can be run. Otherwise the finding says "reasoned, not run" and gives the
reasoning.

A change that breaks a settled rule a lens cites, or lacks what that rule
requires (a verbatim quote and stamp, a `read_if`, a test that fails before the
fix), is a FIX. For example, deadvox code that decides one item's behaviour, a
decision `deadvox/DESIGN.md`, "Pillars", "Depth through data", gives to content,
is a FIX. A violation of a settled rule is a real defect in the sense of
`AGENTS.md`, "Tests", whose FIX threshold the review applies. The rules' owners
also set what blocks: `AGENTS.md`, "Tests" and "Zero drift"; `README.md`, "Zero
drift"; and `docs/PROCESS.md`, "The life of a change", step 4. Anything else is
listed and doesn't block.

For a settled rule, missing evidence is not a status. The reviewer gets it before
the verdict, by fetching it, probing or asking the lead.

An outstanding BR approval is an open gate, not one the reviewer can grant. Merge
conditions stay with `docs/PROCESS.md`, "The life of a change", step 6.

## Changes to PROCESS when r75 lands

This proposal doesn't edit `docs/PROCESS.md`. The PR that lands the skill makes
these changes:

- **"The life of a change", step 4:** the code review includes the principles
  section in this doc. Step 4's zero-drift list stays in step 4, as the rule lens 3
  cites.
- **"Slice decision rules", "FIX causes":** two more causes, "docs" for a
  zero-drift FIX and "ownership" for content-versus-code ownership, so the
  retrospective tally shows them.

After applying these edits to `docs/PROCESS.md`, the landing PR deletes this
section and the "(draft)" mark, so the landed doc stays a current record.

## Canonical home

Keep one tracked, harness-neutral skill document under `docs/`. Add thin
harness-specific entry points only if needed; they point to the canonical text
rather than copy its instructions. This gives every agent the same review
contract without creating competing rule owners.

## Unresolved dependencies

- **r74** settles what deadvox's "Depth through data" doesn't cover: gungen and
  mobgen templates, the selector and closed-list rule, the modifier point, and the
  ratchet checks for content-id literals and closed lists. Until its owner doc
  lands, those parts of lens 2 are not assessed. Forward compatibility, accepting
  new authored values, stays apart from backwards compatibility; it must not bring
  in an obligation to keep old schemas or saves working (`AGENTS.md`, "Project
  stage").
- **Additional lenses:** a lens such as accessibility needs an owning project rule
  first. The skill applies settled rules; it doesn't make policy through review
  findings.
