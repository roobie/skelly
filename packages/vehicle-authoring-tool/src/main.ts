import { buildBundledContent } from '../../deadvox/src/game/bundledContent.ts';
import {
  addFitting,
  blueprintIssues,
  checkedExport,
  createMirroredPair,
  type Fitting,
  pairChoicesFromForm,
  removeFitting,
  renameFitting,
  type Service,
  saveBlueprint,
  setAt,
  setCargo,
  setService,
  setSupportedBy,
  toggleMirror,
  type Vec3,
} from './editor.ts';
import type { VehicleBlueprintInput } from './export.ts';
import { registryIssueText } from './issues.ts';

const select = document.querySelector<HTMLSelectElement>('#blueprint')!;
const table = document.querySelector<HTMLTableSectionElement>('#fittings')!;
const issues = document.querySelector<HTMLPreElement>('#issues')!;
const message = document.querySelector<HTMLParagraphElement>('#message')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
const add = document.querySelector<HTMLFormElement>('#add')!;
const parts = document.querySelector<HTMLDataListElement>('#parts')!;
const pairDialog = document.querySelector<HTMLDialogElement>('#pair')!;

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
for (const item of content.registry.items.values()) {
  if (item.vehicle) {
    const option = document.createElement('option');
    option.value = item.id;
    parts.append(option);
  }
}

let edited: VehicleBlueprintInput | undefined;

const loadSelected = (): VehicleBlueprintInput =>
  JSON.parse(JSON.stringify(content.registry.vehicleBlueprints.get(select.value)!)) as VehicleBlueprintInput;

const numbers = (text: string): number[] => text.split(',').map((part) => Number(part.trim()));
const ids = (text: string): string[] =>
  text
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

/** Applies one editor operation; a refusal shows as text and leaves the blueprint as it was. */
const apply = (operation: (blueprint: VehicleBlueprintInput) => VehicleBlueprintInput) => {
  try {
    edited = operation(edited!);
    message.textContent = '';
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
  }
  show();
};

const addCell = (tr: HTMLTableRowElement, child: Node) => tr.insertCell().append(child);

const textInput = (value: string, onChange: (value: string) => void): HTMLInputElement => {
  const input = document.createElement('input');
  input.value = value;
  input.addEventListener('change', () => onChange(input.value));
  return input;
};

const button = (label: string, onClick: () => void): HTMLButtonElement => {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', onClick);
  return element;
};

const atInput = (fitting: Fitting): HTMLInputElement =>
  textInput(fitting.at.join(', '), (value) => {
    const at = numbers(value);
    apply((blueprint) => {
      if (at.length !== 3 || at.some((n) => !Number.isFinite(n))) {
        throw new Error('Position is three numbers: x, y, z');
      }
      return setAt(blueprint, fitting.id, at as unknown as Vec3);
    });
  });

const cargoInput = (fitting: Fitting): HTMLInputElement =>
  textInput(fitting.cargo?.join(', ') ?? '', (value) =>
    apply((blueprint) => {
      if (value.trim() === '') {
        return setCargo(blueprint, fitting.id, undefined);
      }
      const cells = numbers(value);
      if (cells.length !== 3 || cells.some((n) => !Number.isInteger(n) || n < 1)) {
        throw new Error('Cargo is three whole cell counts: x, y, z');
      }
      return setCargo(blueprint, fitting.id, cells as unknown as NonNullable<Fitting['cargo']>);
    }),
  );

const serviceInput = (fitting: Fitting): HTMLInputElement =>
  textInput(fitting.service ? JSON.stringify(fitting.service) : '', (value) =>
    apply((blueprint) => {
      if (value.trim() === '') {
        return setService(blueprint, fitting.id, undefined);
      }
      try {
        return setService(blueprint, fitting.id, JSON.parse(value) as Service);
      } catch (error) {
        throw new Error('Service is JSON: name, mount, durationSimSeconds, qualities', { cause: error });
      }
    }),
  );

const mirrorInput = (fitting: Fitting): HTMLInputElement => {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = fitting.mirror === true;
  input.addEventListener('change', () => apply((blueprint) => toggleMirror(blueprint, fitting.id)));
  return input;
};

const row = (fitting: Fitting): HTMLTableRowElement => {
  const tr = document.createElement('tr');
  addCell(
    tr,
    textInput(fitting.id, (value) => apply((blueprint) => renameFitting(blueprint, fitting.id, value))),
  );
  addCell(tr, document.createTextNode(fitting.part));
  addCell(tr, atInput(fitting));
  addCell(tr, mirrorInput(fitting));
  addCell(
    tr,
    textInput(fitting.supportedBy.join(', '), (value) =>
      apply((blueprint) => setSupportedBy(blueprint, fitting.id, ids(value))),
    ),
  );
  addCell(tr, cargoInput(fitting));
  addCell(tr, serviceInput(fitting));
  const actions = tr.insertCell();
  actions.append(
    button('Remove', () => apply((blueprint) => removeFitting(blueprint, fitting.id))),
    button('Pair…', () => openPair(fitting)),
  );
  return tr;
};

const show = () => {
  const blueprint = edited!;
  table.replaceChildren(...blueprint.fittings.map(row));
  issues.textContent = [registryIssueText(content.issues), blueprintIssues(content.registry, blueprint).join('\n')]
    .filter((text) => text !== '')
    .join('\n');
  const url = new URL(location.href);
  url.searchParams.set('blueprint', blueprint.id);
  history.replaceState(undefined, '', url);
};

const labelled = (text: string, control: HTMLElement): HTMLLabelElement => {
  const label = document.createElement('label');
  label.append(`${text} `, control);
  return label;
};

const choice = (options: readonly string[]): HTMLSelectElement => {
  const element = document.createElement('select');
  for (const option of ['', ...options]) {
    element.add(new Option(option === '' ? 'Choose…' : option, option));
  }
  return element;
};

const openPair = (fitting: Fitting) => {
  const blueprint = edited!;
  const base = textInput(fitting.id, () => undefined);
  const supports = fitting.supportedBy.map((support) => ({
    support,
    kind: choice(['shared', 'paired']),
    far: textInput('', () => undefined),
  }));
  const resting = blueprint.fittings.filter(
    ({ id, supportedBy }) => id !== fitting.id && supportedBy.includes(fitting.id),
  );
  const outside = resting.map(({ id }) => ({ id, side: choice(['near', 'far', 'both']) }));
  const names = fitting.service
    ? { near: textInput('', () => undefined), far: textInput('', () => undefined) }
    : undefined;
  const form = document.createElement('form');
  form.method = 'dialog';
  form.append(
    labelled('Base id', base),
    ...supports.map(({ support, kind, far }) => {
      const label = labelled(`Rests on ${support}:`, kind);
      label.append(' far twin uses ', far);
      return label;
    }),
    ...outside.map(({ id, side }) => labelled(`${id} rests on the original: moves to`, side)),
    ...(names ? [labelled('Near service name', names.near), labelled('Far service name', names.far)] : []),
  );
  const pairMessage = document.createElement('p');
  pairMessage.setAttribute('role', 'status');
  form.append(pairMessage);
  const buttons = document.createElement('div');
  const create = button('Create pair', () => {
    try {
      const choices = pairChoicesFromForm({
        base: base.value,
        supports: supports.map(({ support, kind, far }) => ({ support, kind: kind.value, far: far.value })),
        outside: outside.map(({ id, side }) => ({ id, side: side.value })),
        ...(names ? { serviceNames: { near: names.near.value, far: names.far.value } } : {}),
      });
      apply((current) => createMirroredPair(current, fitting.id, choices));
      pairDialog.close();
    } catch (error) {
      pairMessage.textContent = error instanceof Error ? error.message : String(error);
    }
  });
  buttons.append(
    create,
    button('Cancel', () => pairDialog.close()),
  );
  form.append(buttons);
  pairDialog.replaceChildren(form);
  pairDialog.showModal();
};

const downloadText = (text: string, name: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};

const start = () => {
  edited = loadSelected();
  message.textContent = '';
  show();
};

const initial = blueprints.find(({ id }) => id === requestedBlueprint) ?? blueprints[0];
if (initial) {
  select.value = initial.id;
  start();
} else {
  save.disabled = true;
  download.disabled = true;
  issues.textContent = registryIssueText(content.issues);
}

select.addEventListener('change', start);
add.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(add);
  apply((blueprint) => addFitting(blueprint, { id: String(data.get('id')), part: String(data.get('part')) }));
});
save.addEventListener('click', () => downloadText(saveBlueprint(edited!), `${edited!.id}.edited.json`));
download.addEventListener('click', () => {
  try {
    downloadText(JSON.stringify(checkedExport(content.registry, edited!), null, 2), `${edited!.id}.json`);
    message.textContent = '';
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
  }
});
