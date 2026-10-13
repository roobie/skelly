---
read_if:
  - you're changing the zero-drift cue scanner or its baseline
  - you're diagnosing a cue failure or assessing what a passing check proves
---

# Zero-drift checker boundaries

`AGENTS.md`, "Zero drift" owns the authoring rule. This document owns the scanner's
trade-offs, not another set of cue spellings. See `tools/zero-drift-check.mjs`,
`checkDocument`, and `test/zero-drift-check.test.mjs`.

## Whole-text scanning

One cue scanner examines every tracked text file, including source, tests, config
and content. Explicitly formatted cues count in strings as well as comments, because
either can carry an explanation; parsing each language's comments would add maintenance
and miss those explanations. Third-party reference files stay as received, so they are
excluded rather than rewritten. Binary files are not text.

The scanner recognizes formatted paths, Markdown links and file/name pairs, not
arbitrary mentions of a filename in code. Module specifiers starting with an at-sign
are dependencies, not repository paths. A quoted name containing markup is not
interpreted as a literal anchor. Outside Markdown, line citations require a known
file extension so ordinary member/value expressions are not mistaken for citations.
Bare Markdown-path recognition excludes string/attribute delimiters and possessives;
a URL query ending in a Markdown filename is not a prose section cue. These boundaries keep the
same scanner usable without language-specific exceptions or a file exemption for
its own negative fixtures.

Wrapped names and cue separators join through line breaks and comment continuation
markers because changing a comment's wrapping must not hide a dangling cue. Paths
still need explicit cue formatting; a pack-relative runtime directory is not a
repository citation. Negative fixtures construct their cues from fragments so the
fixture source is not itself a false repository citation.

## Anchor identity

Named Markdown anchors tolerate section-number prefixes, punctuation, parenthetical
stamps and subtitles because these are not the topic's identity. Renaming the topic
still breaks its cues. Bold lead-ins serve as named anchors because design decisions
use those labels without making each decision a heading. Heading-link fragments
use the full title's GitHub slug, including duplicate suffixes, rather than that
relaxed name comparison. A CommonMark/GFM parser supplies Markdown structure because
regex approximations kept disagreeing with GitHub's rendering. The parser owns headings,
inline code and emphasis, escapes, links and destinations, HTML comments, and front
matter; `github-slugger` computes slugs from rendered heading text. Front matter, fenced
examples and actual HTML comments are excluded because they do not appear as headings,
while code-span contents remain because they are visible even when they look like
comments. This keeps cue resolution aligned with what readers see. Angle-wrapped
link destinations resolve against the same normalized path and fragment. See
`tools/zero-drift-check.mjs`, `anchorsFor`, `githubSlug` and `checkSectionLink`.

Names in non-Markdown targets are literal text rather than normalized headings:
normalization could silently turn a removed test name into a different test. Cached
target reads keep cross-file resolution cheap without changing what is checked.

## Enforcement and limits

Alternate section spellings cannot be baselined because accepting examples would
teach readers to copy them. Other inherited violations use the existing ratchet;
regenerating it is not permission to absorb fixable cues. See
`tools/zero-drift-check.mjs`, `comparePolicy`.

Statement-style references and table-row descriptions are not mechanically resolved.
A passing check proves recognized cues resolve, not that every factual statement in
a file remains true or that a cited section supports the surrounding claim.
