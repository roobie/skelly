import assert from 'node:assert/strict';
import test from 'node:test';
import { firstUpload, pinnedRequirements } from './pypi.mjs';

test('a requirements file names its exact pins under normalized names, not options or loose specifiers', () => {
  const requirements = [
    '--index-url https://pypi.org/simple',
    'Boolean.Py==5.0 \\',
    '    --hash=sha256:aaaa \\',
    '    --hash=sha256:bbbb',
    '    # via license-expression',
    'jinja2[i18n] == 3.1.6 ; python_version >= "3.9"  # templating',
    'loose>=1.0',
    '# pinned==0.1',
  ].join('\n');

  assert.deepEqual(
    [...pinnedRequirements(requirements).values()],
    [
      { name: 'boolean-py', version: '5.0' },
      { name: 'jinja2', version: '3.1.6' },
    ],
  );
});

test('a version is released at its first file upload, and a version without files is not released', () => {
  // biome-ignore lint/style/useNamingConvention: the fixture mirrors PyPI's field names.
  const upload = (time) => ({ upload_time_iso_8601: time });
  const version = { urls: [upload('2025-04-03T10:39:49.734Z'), upload('2025-04-03T10:39:48.449Z')] };

  assert.equal(firstUpload(version)?.toISOString(), '2025-04-03T10:39:48.449Z');
  assert.equal(firstUpload({ urls: [] }), undefined);
  assert.equal(firstUpload(undefined), undefined);
});
