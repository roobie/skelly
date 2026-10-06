/** The vehicle spike's control panel, rendered from the page's state by lit-html. */
import { html, type TemplateResult } from 'lit-html';
import { ifDefined } from 'lit-html/directives/if-defined.js';

export interface PanelChoice {
  readonly id: string;
  readonly label: string;
  readonly title?: string;
}

export interface PanelFitting {
  readonly id: string;
  readonly label: string;
  readonly fitted: boolean;
}

export interface PanelModel {
  readonly builds: readonly PanelChoice[];
  readonly build: string;
  readonly views: readonly PanelChoice[];
  readonly view: string;
  readonly layers: readonly PanelChoice[];
  readonly layer: string;
  readonly stats: string;
  readonly notice: string;
  readonly spin: boolean;
  readonly doors: boolean;
  readonly fittings: readonly PanelFitting[];
  readonly grain: string;
  readonly perf: string;
  readonly error: string;
}

export interface PanelActions {
  readonly onBuild: (id: string) => void;
  readonly onView: (id: string) => void;
  readonly onLayer: (id: string) => void;
  readonly onSpin: (on: boolean) => void;
  readonly onDoors: (open: boolean) => void;
  readonly onFitting: (id: string) => void;
  readonly onSchematic: (event: PointerEvent) => void;
}

const choiceButtons = (
  choices: readonly PanelChoice[],
  selected: string,
  pick: (id: string) => void,
): TemplateResult[] =>
  choices.map(
    (choice) => html`
      <button
        type="button"
        title=${ifDefined(choice.title)}
        aria-pressed=${choice.id === selected ? 'true' : 'false'}
        @click=${() => pick(choice.id)}
      >
        ${choice.label}
      </button>
    `,
  );

const checked = (event: Event): boolean => (event.target as HTMLInputElement).checked;

/** The schematic canvas has no bindings, so lit keeps the same element across renders and the page draws into it. */
export const panelTemplate = (vm: PanelModel, actions: PanelActions): TemplateResult => html`
  <h1>Vehicles from parts</h1>
  <p class="quiet">
    Each fitting places one voxel part type on the vehicle and rests on the fittings that hold it up. Pick a build
    and a view, then click a fitting in the schematic or the list to take it off or fit it.
  </p>
  <h2>Build</h2>
  <div class="row">${choiceButtons(vm.builds, vm.build, actions.onBuild)}</div>
  <p id="stats" aria-live="polite">${vm.stats}</p>
  <p id="notice" role="status">${vm.notice}</p>
  <h2>View · keys 1–${vm.views.length}</h2>
  <div class="row">${choiceButtons(vm.views, vm.view, actions.onView)}</div>
  <div class="row">
    <label class="toggle">
      <input type="checkbox" .checked=${vm.spin} @change=${(event: Event) => actions.onSpin(checked(event))} />
      Spin wheels
    </label>
    <label class="toggle">
      <input type="checkbox" .checked=${vm.doors} @change=${(event: Event) => actions.onDoors(checked(event))} />
      Open doors
    </label>
  </div>
  <h2>Part schematic · top-down</h2>
  <div class="row">${choiceButtons(vm.layers, vm.layer, actions.onLayer)}</div>
  <canvas
    id="schematic"
    width="720"
    height="320"
    role="img"
    aria-label="Top-down vehicle part lattice; click a fitting to toggle it"
    @pointerdown=${actions.onSchematic}
  ></canvas>
  <p class="quiet">
    Solid = fitted; dashed = off. The amber cross is the computed centre of mass. A cell click toggles the smallest
    fitting of the selected layer under it.
  </p>
  <h2>Fittings in selected layer</h2>
  <div id="parts-list">
    ${vm.fittings.map(
      (fitting) => html`
        <button
          type="button"
          class="part-toggle"
          aria-pressed=${fitting.fitted ? 'true' : 'false'}
          @click=${() => actions.onFitting(fitting.id)}
        >
          ${fitting.fitted ? '●' : '○'} ${fitting.label} · ${fitting.id}
        </button>
      `,
    )}
  </div>
  <p id="grain-note">${vm.grain}</p>
  <p id="perf">${vm.perf}</p>
  <div id="error" role="status">${vm.error}</div>
`;
