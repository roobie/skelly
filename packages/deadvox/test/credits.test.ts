// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mergeManifests, validateManifest } from '../../engine/src/content.ts';
import { creditsViewModel, mountCredits } from '../src/ui/credits.ts';
import { baseScreenText } from './baseRegistry.ts';

describe('creditsViewModel', () => {
  it('is empty when the manifest has no sources', () => {
    const { manifest } = validateManifest('fixture.json', { sources: [] });
    expect(creditsViewModel(manifest).entries).toEqual([]);
  });

  it('builds an entry with a link, an author and the licence', () => {
    const { manifest } = validateManifest('fixture.json', {
      sources: [
        {
          title: 'Flashlight model',
          url: 'https://example.com/flashlight',
          author: 'Jane Doe',
          licence: 'CC-BY-4.0',
          download: null,
          files: ['assets/models/flashlight.glb'],
          changes: 'Recolored to matte black',
        },
      ],
    });
    expect(creditsViewModel(manifest).entries).toEqual([
      {
        title: 'Flashlight model',
        links: [{ url: 'https://example.com/flashlight', host: 'example.com' }],
        author: 'Jane Doe',
        licenceName: 'CC BY 4.0',
        licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
        changes: 'Recolored to matte black',
      },
    ]);
  });

  it('shows original work with no licence as plain text rather than a broken link', () => {
    const { manifest } = validateManifest('fixture.json', {
      sources: [
        {
          title: 'BR csound gunshot synthesis',
          url: null,
          author: 'BR',
          licence: 'NONE',
          download: null,
          files: ['assets/audio/gunshot-akm-01.ogg'],
          changes: 'Trimmed trailing silence only.',
        },
      ],
    });
    expect(creditsViewModel(manifest).entries[0]).toMatchObject({
      licenceName: 'No licence required',
      licenceUrl: null,
    });
  });

  it('leaves the host and author out when a source has neither a link nor a listed author', () => {
    const { manifest } = validateManifest('fixture.json', {
      sources: [
        {
          title: 'Rag texture',
          url: null,
          author: null,
          licence: 'CC0-1.0',
          download: null,
          files: ['assets/textures/rag.png'],
          changes: null,
        },
      ],
    });
    expect(creditsViewModel(manifest).entries[0]).toMatchObject({ links: [], author: null, changes: null });
  });

  it('shows a source once with each distinct link when packs differ only in links, and twice when other text differs', () => {
    const source = {
      title: 'Fixture source',
      url: 'https://example.com/fixture',
      author: 'Fixture author',
      licence: 'CC-BY-4.0',
      download: null,
      changes: 'Fixture changes',
    };
    const packed = (other: object) =>
      mergeManifests([
        { source: 'pack-a/assets/manifest.json', data: { sources: [{ ...source, files: ['assets/audio/a.ogg'] }] } },
        {
          source: 'pack-b/assets/manifest.json',
          data: { sources: [{ ...source, ...other, files: ['assets/audio/b.ogg'] }] },
        },
      ]).manifest;

    expect(creditsViewModel(packed({})).entries.map(({ title }) => title)).toEqual([source.title]);
    expect(creditsViewModel(packed({})).entries[0]!.links.map(({ url }) => url)).toEqual([source.url]);
    expect(creditsViewModel(packed({ changes: 'Other changes' })).entries.map(({ changes }) => changes)).toEqual([
      source.changes,
      'Other changes',
    ]);

    const otherUrl = 'https://example.com/other';
    const linked = creditsViewModel(packed({ url: otherUrl }));
    expect(linked.entries.map(({ links }) => links.map(({ url }) => url))).toEqual([[source.url, otherUrl]]);

    const box = document.createElement('div');
    mountCredits(
      { about: document.createElement('div'), box, show: document.createElement('a') },
      packed({ url: otherUrl }),
      baseScreenText().credits,
    );
    const hrefs = [...box.querySelectorAll('.credits a')].map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining([source.url, otherUrl]));
  });
});
