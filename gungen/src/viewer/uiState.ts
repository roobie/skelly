export const UI_STATE_KEY = 'gungen.ui-state';

export type AssemblySelection = { kind: 'fixture'; name: string } | { kind: 'generated' } | { kind: 'upload' };

/** Param-panel overrides on top of the current baseline (fixture, upload, or seed). */
export interface StoredOverrides {
  readonly params: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly presence: Readonly<Record<string, boolean>>;
}

export interface UiState {
  version: 1;
  assembly: AssemblySelection;
  template: string;
  seed: string;
  onlyValid: boolean;
  overrides: StoredOverrides;
  layers: {
    solids: boolean;
    ports: boolean;
    keepOuts: boolean;
    axes: boolean;
  };
}

export const DEFAULT_UI_STATE: UiState = {
  version: 1,
  assembly: { kind: 'fixture', name: 'archetype-battle-rifle' },
  template: 'battle-rifle',
  seed: '0',
  onlyValid: false,
  overrides: { params: {}, presence: {} },
  layers: { solids: true, ports: true, keepOuts: true, axes: true },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every((v) => typeof v === 'string');

const isBooleanRecord = (value: unknown): value is Record<string, boolean> =>
  isRecord(value) && Object.values(value).every((v) => typeof v === 'boolean');

const parseStoredOverrides = (value: unknown): StoredOverrides => {
  if (!isRecord(value)) {
    return structuredClone(DEFAULT_UI_STATE.overrides);
  }
  const params = isRecord(value.params) && Object.values(value.params).every(isStringRecord) ? value.params : {};
  const presence = isBooleanRecord(value.presence) ? value.presence : {};
  return { params: params as StoredOverrides['params'], presence };
};

const parseAssemblySelection = (assembly: Record<string, unknown>): AssemblySelection => {
  if (assembly.kind === 'fixture' && typeof assembly.name === 'string') {
    return { kind: 'fixture', name: assembly.name };
  }
  if (assembly.kind === 'generated') {
    return { kind: 'generated' };
  }
  if (assembly.kind === 'upload') {
    return { kind: 'upload' };
  }
  return structuredClone(DEFAULT_UI_STATE.assembly);
};

export const parseUiState = (serialized: string | null): UiState => {
  if (serialized === null) {
    return structuredClone(DEFAULT_UI_STATE);
  }
  try {
    const value: unknown = JSON.parse(serialized);
    if (!isRecord(value) || value.version !== 1) {
      return structuredClone(DEFAULT_UI_STATE);
    }
    const assembly = isRecord(value.assembly) ? value.assembly : {};
    const layers = isRecord(value.layers) ? value.layers : {};
    const selectedAssembly = parseAssemblySelection(assembly);
    return {
      version: 1,
      assembly: selectedAssembly,
      template: typeof value.template === 'string' ? value.template : DEFAULT_UI_STATE.template,
      seed: typeof value.seed === 'string' ? value.seed : DEFAULT_UI_STATE.seed,
      onlyValid: typeof value.onlyValid === 'boolean' ? value.onlyValid : DEFAULT_UI_STATE.onlyValid,
      overrides: parseStoredOverrides(value.overrides),
      layers: {
        solids: typeof layers.solids === 'boolean' ? layers.solids : DEFAULT_UI_STATE.layers.solids,
        ports: typeof layers.ports === 'boolean' ? layers.ports : DEFAULT_UI_STATE.layers.ports,
        keepOuts: typeof layers.keepOuts === 'boolean' ? layers.keepOuts : DEFAULT_UI_STATE.layers.keepOuts,
        axes: typeof layers.axes === 'boolean' ? layers.axes : DEFAULT_UI_STATE.layers.axes,
      },
    };
  } catch {
    return structuredClone(DEFAULT_UI_STATE);
  }
};
