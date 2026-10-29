import { vehicleContentIssues } from '../../deadvox/src/core/vehicleBlueprint.ts';
import { buildBundledContent } from '../../deadvox/src/game/bundledContent.ts';
import { exportVehicleBlueprint } from './export.ts';
import { registryIssueText } from './issues.ts';

const select = document.querySelector<HTMLSelectElement>('#blueprint')!;
const fittings = document.querySelector<HTMLUListElement>('#fittings')!;
const issues = document.querySelector<HTMLPreElement>('#issues')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;

// This is Deadvox's production base-content loader, rather than the test fixture's partial source list.
const content = buildBundledContent();
const blueprints = [...content.registry.vehicleBlueprints.values()];
const requestedBlueprint = new URLSearchParams(location.search).get('blueprint');

for (const blueprint of blueprints) {
  const option = document.createElement('option');
  option.value = blueprint.id;
  option.textContent = blueprint.name;
  select.add(option);
}

const selectedBlueprint = () => content.registry.vehicleBlueprints.get(select.value)!;

const issueText = () => {
  const vehicleIssues = vehicleContentIssues(content.registry)
    .filter((issue) => issue.id === selectedBlueprint().id)
    .map(({ path, message }) => `${path}: ${message}`)
    .join('\n');
  return [registryIssueText(content.issues), vehicleIssues].filter((text) => text !== '').join('\n');
};

const show = () => {
  const blueprint = selectedBlueprint();
  fittings.replaceChildren(
    ...blueprint.fittings.map((fitting) => {
      const row = document.createElement('li');
      row.textContent = `${fitting.id}: ${fitting.part}`;
      return row;
    }),
  );
  issues.textContent = issueText();
  const url = new URL(location.href);
  url.searchParams.set('blueprint', blueprint.id);
  history.replaceState(undefined, '', url);
};

const initial = blueprints.find(({ id }) => id === requestedBlueprint) ?? blueprints[0];
if (initial) {
  select.value = initial.id;
  show();
} else {
  download.disabled = true;
  issues.textContent = registryIssueText(content.issues);
}

select.addEventListener('change', show);
download.addEventListener('click', () => {
  const blueprint = selectedBlueprint();
  const blob = new Blob([JSON.stringify(exportVehicleBlueprint(blueprint), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${blueprint.id}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});
