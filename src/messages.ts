import type { Align, LayoutMode, Sizing } from './layout.ts';

export type ValueCategory = 'gap' | 'pad';
export type ErrorReason = 'no-selection' | 'not-a-section' | 'empty-section';

export interface StoredConfig {
  layout: LayoutMode;
  alignH: Align;
  alignV: Align;
  sizing: Sizing;
  gap: number;
  padMulti: boolean;
  padAll: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
  gridColumns: number;
  gridRows: number;
  gridWrap: boolean;
}

export interface CustomValues {
  gap: number[];
  pad: number[];
}

export type SelectionState =
  | { valid: true; name: string; count: number }
  | { valid: false; reason: ErrorReason; name: string };

export type UiMessage =
  | { type: 'apply'; config: StoredConfig }
  | { type: 'save-value'; category: ValueCategory; value: number }
  | { type: 'delete-value'; category: ValueCategory; value: number };

export type PluginMessage =
  | { type: 'init'; selection: SelectionState; config: StoredConfig | null; values: CustomValues }
  | { type: 'selection'; selection: SelectionState }
  | { type: 'applied' }
  | { type: 'values'; values: CustomValues };

export const DEFAULT_CONFIG: StoredConfig = {
  layout: 'horizontal',
  alignH: 'center',
  alignV: 'center',
  sizing: 'hug',
  gap: 64,
  padMulti: false,
  padAll: 64,
  padTop: 64,
  padRight: 64,
  padBottom: 64,
  padLeft: 64,
  gridColumns: 0,
  gridRows: 0,
  gridWrap: true,
};
