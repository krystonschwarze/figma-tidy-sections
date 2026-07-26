import { arrange, MAX_GRID_TRACKS, readingOrder } from './layout.ts';
import type { Align, Box, LayoutConfig, LayoutMode, Sizing } from './layout.ts';
import { DEFAULT_CONFIG } from './messages.ts';
import type {
  CustomValues,
  PluginMessage,
  SelectionState,
  StoredConfig,
  UiMessage,
  ValueCategory,
} from './messages.ts';

/* Keys still carry the plugin's former name so the presets people already saved survive the rename. */
const STORAGE_CONFIG = 'sectify-last';
const STORAGE_VALUES = 'sectify-values';
const MAX_VALUE = 2000;

figma.showUI(__html__, {
  width: 280,
  height: 560,
  title: 'Tidy Sections',
  themeColors: true,
});

function send(message: PluginMessage): void {
  figma.ui.postMessage(message);
}

function readSelection(): SelectionState {
  const [node] = figma.currentPage.selection;
  if (!node) return { valid: false, reason: 'no-selection', name: '' };
  if (node.type !== 'SECTION') return { valid: false, reason: 'not-a-section', name: node.name };
  if (node.children.length === 0) {
    return { valid: false, reason: 'empty-section', name: node.name };
  }
  return { valid: true, name: node.name, count: node.children.length };
}

function selectedSection(): SectionNode | null {
  const [node] = figma.currentPage.selection;
  return node?.type === 'SECTION' && node.children.length > 0 ? node : null;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const LAYOUTS: readonly LayoutMode[] = ['horizontal', 'vertical', 'grid', 'auto'];
const ALIGNS: readonly Align[] = ['start', 'center', 'end'];
const SIZINGS: readonly Sizing[] = ['hug', 'fixed'];

function sanitizeConfig(input: Partial<StoredConfig> | null | undefined): StoredConfig {
  const source = input ?? {};
  return {
    layout: oneOf(source.layout, LAYOUTS, DEFAULT_CONFIG.layout),
    alignH: oneOf(source.alignH, ALIGNS, DEFAULT_CONFIG.alignH),
    alignV: oneOf(source.alignV, ALIGNS, DEFAULT_CONFIG.alignV),
    sizing: oneOf(source.sizing, SIZINGS, DEFAULT_CONFIG.sizing),
    gap: clamp(source.gap, 0, MAX_VALUE, DEFAULT_CONFIG.gap),
    padMulti: source.padMulti === true,
    padAll: clamp(source.padAll, 0, MAX_VALUE, DEFAULT_CONFIG.padAll),
    padTop: clamp(source.padTop, 0, MAX_VALUE, DEFAULT_CONFIG.padTop),
    padRight: clamp(source.padRight, 0, MAX_VALUE, DEFAULT_CONFIG.padRight),
    padBottom: clamp(source.padBottom, 0, MAX_VALUE, DEFAULT_CONFIG.padBottom),
    padLeft: clamp(source.padLeft, 0, MAX_VALUE, DEFAULT_CONFIG.padLeft),
    gridColumns: clamp(source.gridColumns, 0, MAX_GRID_TRACKS, DEFAULT_CONFIG.gridColumns),
    gridRows: clamp(source.gridRows, 0, MAX_GRID_TRACKS, DEFAULT_CONFIG.gridRows),
    gridWrap: source.gridWrap !== false,
  };
}

function sanitizeValues(input: unknown): CustomValues {
  const source = input as Partial<CustomValues> | undefined;
  const list = (values: unknown): number[] =>
    Array.isArray(values)
      ? [...new Set(values.filter((v): v is number => typeof v === 'number' && v >= 0))].sort(
          (a, b) => a - b,
        )
      : [];
  return { gap: list(source?.gap), pad: list(source?.pad) };
}

function toLayoutConfig(config: StoredConfig): LayoutConfig {
  const padding = config.padMulti
    ? {
        top: config.padTop,
        right: config.padRight,
        bottom: config.padBottom,
        left: config.padLeft,
      }
    : { top: config.padAll, right: config.padAll, bottom: config.padAll, left: config.padAll };

  return {
    layout: config.layout,
    alignH: config.alignH,
    alignV: config.alignV,
    padding,
    gap: config.gap,
    gridColumns: config.gridColumns,
    gridRows: config.gridRows,
    gridWrap: config.gridWrap,
    sizing: config.sizing,
  };
}

function applyLayout(section: SectionNode, config: StoredConfig): void {
  const layoutConfig = toLayoutConfig(config);
  const { padding } = layoutConfig;
  const children = readingOrder(section.children);
  const boxes: Box[] = children.map((child) => ({
    x: child.x,
    y: child.y,
    width: child.width,
    height: child.height,
  }));

  const available =
    config.sizing === 'fixed'
      ? {
          x: 0,
          y: 0,
          width: Math.max(0, section.width - padding.left - padding.right),
          height: Math.max(0, section.height - padding.top - padding.bottom),
        }
      : null;

  const result = arrange(boxes, layoutConfig, available);

  children.forEach((child, index) => {
    const placement = result.placements[index];
    if (!placement) return;
    child.x = padding.left + placement.x;
    child.y = padding.top + placement.y;
  });

  section.resizeWithoutConstraints(
    Math.max(1, padding.left + result.width + padding.right),
    Math.max(1, padding.top + result.height + padding.bottom),
  );
}

async function loadValues(): Promise<CustomValues> {
  return sanitizeValues(await figma.clientStorage.getAsync(STORAGE_VALUES));
}

async function updateValues(
  category: ValueCategory,
  change: (current: number[]) => number[],
): Promise<void> {
  const values = await loadValues();
  values[category] = change(values[category]);
  await figma.clientStorage.setAsync(STORAGE_VALUES, values);
  send({ type: 'values', values });
}

async function handleMessage(message: UiMessage): Promise<void> {
  switch (message.type) {
    case 'apply': {
      const section = selectedSection();
      if (!section) {
        figma.notify('Select a section with at least one child first.', { error: true });
        return;
      }
      const config = sanitizeConfig(message.config);
      applyLayout(section, config);
      await figma.clientStorage.setAsync(STORAGE_CONFIG, config);
      send({ type: 'applied' });
      const count = section.children.length;
      figma.notify(`Arranged ${count} ${count === 1 ? 'item' : 'items'} in "${section.name}"`);
      return;
    }
    case 'save-value': {
      const value = clamp(message.value, 0, MAX_VALUE, 0);
      await updateValues(message.category, (current) =>
        [...new Set([...current, value])].sort((a, b) => a - b),
      );
      return;
    }
    case 'delete-value': {
      await updateValues(message.category, (current) =>
        current.filter((entry) => entry !== message.value),
      );
      return;
    }
  }
}

figma.ui.onmessage = (message: UiMessage) => {
  void handleMessage(message).catch((error: unknown) => {
    const detail = error instanceof Error ? error.message : 'Unknown error';
    figma.notify(`Tidy Sections failed: ${detail}`, { error: true });
  });
};

figma.on('selectionchange', () => {
  send({ type: 'selection', selection: readSelection() });
});

async function start(): Promise<void> {
  const [storedConfig, values] = await Promise.all([
    figma.clientStorage.getAsync(STORAGE_CONFIG) as Promise<Partial<StoredConfig> | undefined>,
    loadValues(),
  ]);
  send({
    type: 'init',
    selection: readSelection(),
    config: storedConfig ? sanitizeConfig(storedConfig) : null,
    values,
  });
}

void start();
