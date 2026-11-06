---
read_if:
  - you add a file and need to know which licence it gets
  - you decide whether a file is content or code
  - you add a third-party file, or record its licence and authors
  - you change a licence statement in the repository, a package or the game
---

# Licensing

The repository holds three kinds of files under three licences. `REUSE.toml` assigns
each path its licence in the [REUSE](https://reuse.software/) format, and `LICENSES/`
holds every licence text it names.

## Content and code

**Content** is licensed CC BY-NC-SA 4.0: every model and the authored source it is built
from, the game's data, maps, and our own sounds, images, logos and cursors. Authored
sources include the thing catalogue batches, vehicle blueprints and their part
definitions, gun designs and cartridges, mob templates, and the content under
`packages/deadvox/src/content`.

**Code** is licensed EUPL-1.2: game and tool source, libraries and kits that build models
or entries from parameters, tests and their fixtures, build config and docs.

The owner sells content separately. A licence that allows commercial use would let
anyone sell a free copy of that content and undercut those sales, so content is
non-commercial. Share-alike keeps adaptations under the same terms, and attribution keeps
the source named. Code stays EUPL so the engine and tools stay open for any use.

Sources are content because the generated models can be rebuilt from them; a source
under a commercial licence would give away the models it builds. For the same reason a
copy of a content file stays content wherever it sits, such as a design kept as a viewer
fixture.

The boundary between content and code inside an authoring folder follows what a file
describes. A library that builds models or entries from parameters is code, even when
it ships starting proportions. A file that describes a specific model, part, body or
piece of game data is content, even when it defines small helpers of its own.

## Third-party files

Third-party files stay as received, under their own licence and authors, read from the
source's own metadata or page. They are never relabelled with ours. They are annotated
last in `REUSE.toml`, so they win over the content and code paths around them. Assets
in a Deadvox pack also record their source in the pack's manifest, which the credits
screen shows; see `packages/deadvox/src/core/assets.ts`, `validateManifest`.

## A new file

A new file takes the licence of the `REUSE.toml` path it falls under, so most files need
no change there. Add or change an annotation when:

- new content sits outside the content paths, or a new kit or builder library sits
  inside one;
- a file comes from a third party. Annotate its licence and authors, and add any
  licence text `LICENSES/` lacks.

`reuse lint` checks that every file has a licence and that every licence named has its
text. It needs no project dependency; run it as `uvx reuse lint` with a release
older than one month, as `AGENTS.md`, "Dependency age" requires.
