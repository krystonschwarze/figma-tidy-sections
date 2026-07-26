export type LayoutMode = 'horizontal' | 'vertical' | 'grid' | 'auto';
export type Align = 'start' | 'center' | 'end';
export type Sizing = 'hug' | 'fixed';

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface LayoutConfig {
  readonly layout: LayoutMode;
  readonly alignH: Align;
  readonly alignV: Align;
  readonly padding: Padding;
  readonly gap: number;
  readonly gridColumns: number;
  readonly gridRows: number;
  readonly gridWrap: boolean;
  readonly sizing: Sizing;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Placement {
  readonly x: number;
  readonly y: number;
}

export interface Arrangement {
  readonly placements: readonly Placement[];
  readonly width: number;
  readonly height: number;
}

export const MAX_GRID_TRACKS = 20;

function alignOffset(available: number, item: number, align: Align): number {
  if (align === 'center') return (available - item) / 2;
  if (align === 'end') return available - item;
  return 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function readingOrder<T extends Box>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (Math.abs(a.y - b.y) < 1 ? a.x - b.x : a.y - b.y));
}

export function resolveGridColumns(count: number, columns: number, rows: number): number {
  if (columns > 0) return Math.min(columns, count);
  if (rows > 0) return Math.max(1, Math.ceil(count / rows));
  if (count <= 3) return Math.max(1, count);
  return Math.ceil(Math.sqrt(count));
}

function trackSizes(items: readonly Box[], columns: number): { cols: number[]; rows: number[] } {
  const cols = new Array<number>(columns).fill(0);
  const rows = new Array<number>(Math.ceil(items.length / columns)).fill(0);
  items.forEach((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    cols[col] = Math.max(cols[col] ?? 0, item.width);
    rows[row] = Math.max(rows[row] ?? 0, item.height);
  });
  return { cols, rows };
}

/* Rows are inferred from the current vertical positions, so a hand made arrangement survives. */
function detectRows(items: readonly Box[]): Box[][] {
  const shortest = Math.min(...items.map((item) => item.height));
  const threshold = Math.max(shortest / 2, 5);
  const sorted = [...items].sort((a, b) =>
    Math.abs(a.y - b.y) < threshold ? a.x - b.x : a.y - b.y,
  );

  const rows: Box[][] = [];
  for (const item of sorted) {
    const current = rows[rows.length - 1];
    const anchor = current?.[0];
    if (current && anchor && Math.abs(item.y - anchor.y) < threshold) current.push(item);
    else rows.push([item]);
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x);
  return rows;
}

interface Linear {
  readonly mainSizes: readonly number[];
  readonly crossSizes: readonly number[];
}

function linear(items: readonly Box[], vertical: boolean): Linear {
  return {
    mainSizes: items.map((item) => (vertical ? item.height : item.width)),
    crossSizes: items.map((item) => (vertical ? item.width : item.height)),
  };
}

function arrangeLinear(
  items: readonly Box[],
  config: LayoutConfig,
  available: Box | null,
  vertical: boolean,
): Arrangement {
  const { mainSizes, crossSizes } = linear(items, vertical);
  const contentMain = sum(mainSizes) + config.gap * (items.length - 1);
  const contentCross = Math.max(...crossSizes);

  const availableMain = available ? (vertical ? available.height : available.width) : contentMain;
  const availableCross = available ? (vertical ? available.width : available.height) : contentCross;
  const mainSize = Math.max(availableMain, contentMain);
  const crossSize = Math.max(availableCross, contentCross);

  const alignMain = vertical ? config.alignV : config.alignH;
  const alignCross = vertical ? config.alignH : config.alignV;

  let cursor = alignOffset(mainSize, contentMain, alignMain);
  const placements = items.map((item, index) => {
    const main = cursor;
    const cross = alignOffset(crossSize, crossSizes[index] ?? 0, alignCross);
    cursor += (mainSizes[index] ?? 0) + config.gap;
    return vertical ? { x: cross, y: main } : { x: main, y: cross };
  });

  return vertical
    ? { placements, width: crossSize, height: mainSize }
    : { placements, width: mainSize, height: crossSize };
}

function arrangeGrid(
  items: readonly Box[],
  config: LayoutConfig,
  available: Box | null,
): Arrangement {
  const columns = config.gridWrap
    ? resolveGridColumns(items.length, config.gridColumns, config.gridRows)
    : items.length;
  const { cols, rows } = trackSizes(items, columns);

  const contentWidth = sum(cols) + config.gap * (cols.length - 1);
  const contentHeight = sum(rows) + config.gap * (rows.length - 1);
  const width = Math.max(available?.width ?? contentWidth, contentWidth);
  const height = Math.max(available?.height ?? contentHeight, contentHeight);

  const originX = alignOffset(width, contentWidth, config.alignH);
  const originY = alignOffset(height, contentHeight, config.alignV);

  const colOffsets = cols.map((_, index) => sum(cols.slice(0, index)) + config.gap * index);
  const rowOffsets = rows.map((_, index) => sum(rows.slice(0, index)) + config.gap * index);

  const placements = items.map((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: originX + (colOffsets[col] ?? 0) + alignOffset(cols[col] ?? 0, item.width, config.alignH),
      y: originY + (rowOffsets[row] ?? 0) + alignOffset(rows[row] ?? 0, item.height, config.alignV),
    };
  });

  return { placements, width, height };
}

function arrangeAuto(
  items: readonly Box[],
  config: LayoutConfig,
  available: Box | null,
): Arrangement {
  const rows = detectRows(items);
  const rowHeights = rows.map((row) => Math.max(...row.map((item) => item.height)));
  const rowWidths = rows.map(
    (row) => sum(row.map((item) => item.width)) + config.gap * (row.length - 1),
  );

  const contentWidth = Math.max(...rowWidths);
  const contentHeight = sum(rowHeights) + config.gap * (rows.length - 1);
  const width = Math.max(available?.width ?? contentWidth, contentWidth);
  const height = Math.max(available?.height ?? contentHeight, contentHeight);

  const originY = alignOffset(height, contentHeight, config.alignV);
  const byItem = new Map<Box, Placement>();

  let cursorY = originY;
  rows.forEach((row, rowIndex) => {
    const rowHeight = rowHeights[rowIndex] ?? 0;
    let cursorX = alignOffset(width, rowWidths[rowIndex] ?? 0, config.alignH);
    for (const item of row) {
      byItem.set(item, {
        x: cursorX,
        y: cursorY + alignOffset(rowHeight, item.height, config.alignV),
      });
      cursorX += item.width + config.gap;
    }
    cursorY += rowHeight + config.gap;
  });

  return {
    placements: items.map((item) => byItem.get(item) ?? { x: 0, y: 0 }),
    width,
    height,
  };
}

/**
 * Places items inside a content box whose origin is 0,0. Pass `available` to align inside a fixed
 * size box, or null to hug the content.
 */
export function arrange(
  items: readonly Box[],
  config: LayoutConfig,
  available: Box | null,
): Arrangement {
  if (items.length === 0) return { placements: [], width: 0, height: 0 };

  switch (config.layout) {
    case 'vertical':
      return arrangeLinear(items, config, available, true);
    case 'grid':
      return arrangeGrid(items, config, available);
    case 'auto':
      return arrangeAuto(items, config, available);
    case 'horizontal':
      return arrangeLinear(items, config, available, false);
  }
}
