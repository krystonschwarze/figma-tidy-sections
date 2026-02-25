// ── Types ──

interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LayoutConfig {
  layout: 'horizontal' | 'vertical' | 'grid';
  alignH: 'start' | 'center' | 'end';
  alignV: 'start' | 'center' | 'end';
  padding: Padding;
  gap: number;
  gridColumns: number;  // 0 = auto
  gridRows: number;     // 0 = auto
  gridWrap: boolean;
}

// ── Show UI ──

figma.showUI(__html__, {
  width: 280,
  height: 460,
  title: 'Sectify',
  themeColors: true
});

// ── Selection Validation ──

function validateAndInit(): void {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'init',
      selectionValid: false,
      childCount: 0,
      sectionName: '',
      errorReason: 'no-selection'
    });
    return;
  }

  const node = selection[0];

  if (node.type !== 'SECTION') {
    figma.ui.postMessage({
      type: 'init',
      selectionValid: false,
      childCount: 0,
      sectionName: '',
      errorReason: 'not-a-section'
    });
    return;
  }

  const section = node;
  if (section.children.length === 0) {
    figma.ui.postMessage({
      type: 'init',
      selectionValid: false,
      childCount: 0,
      sectionName: section.name,
      errorReason: 'empty-section'
    });
    return;
  }

  figma.ui.postMessage({
    type: 'init',
    selectionValid: true,
    childCount: section.children.length,
    sectionName: section.name
  });
}

// Run on startup
validateAndInit();

// Re-run when selection changes (live update)
figma.on('selectionchange', () => {
  validateAndInit();
});

// ── Helpers ──

function sortByPosition(children: readonly SceneNode[]): SceneNode[] {
  return [...children].sort((a, b) => {
    if (Math.abs(a.y - b.y) < 1) return a.x - b.x;
    return a.y - b.y;
  });
}

function alignOffset(available: number, item: number, align: 'start' | 'center' | 'end'): number {
  if (align === 'center') return (available - item) / 2;
  if (align === 'end') return available - item;
  return 0;
}

function resolveGridColumns(count: number, requestedCols: number, requestedRows: number): number {
  if (requestedCols > 0) return Math.min(requestedCols, count);
  if (requestedRows > 0) return Math.ceil(count / requestedRows);
  // Auto: roughly square
  if (count <= 3) return count;
  return Math.ceil(Math.sqrt(count));
}

function getColumnWidths(children: SceneNode[], columns: number): number[] {
  const widths = new Array<number>(columns).fill(0);
  children.forEach((child, i) => {
    const col = i % columns;
    widths[col] = Math.max(widths[col], child.width);
  });
  return widths;
}

function getRowHeights(children: SceneNode[], columns: number): number[] {
  const rows = Math.ceil(children.length / columns);
  const heights = new Array<number>(rows).fill(0);
  children.forEach((child, i) => {
    const row = Math.floor(i / columns);
    heights[row] = Math.max(heights[row], child.height);
  });
  return heights;
}

// ── Layout: Horizontal ──

function layoutHorizontal(children: SceneNode[], config: LayoutConfig): { width: number; height: number } {
  const { alignH, alignV, padding, gap } = config;
  const maxH = Math.max(...children.map(c => c.height));
  const totalChildWidth = children.reduce((sum, c) => sum + c.width, 0) + gap * (children.length - 1);

  // Main-axis start offset (alignH controls packing along x)
  let startX = padding.left;
  if (alignH === 'center') {
    // We'll compute final width first, then shift
    // For center/end, we still lay out sequentially but adjust the start
  }

  // Lay out sequentially first
  const positions: { x: number; y: number }[] = [];
  let cursorX = 0;
  for (const child of children) {
    const y = alignOffset(maxH, child.height, alignV);
    positions.push({ x: cursorX, y });
    cursorX += child.width + gap;
  }

  // Content area width (without padding)
  const contentWidth = cursorX - gap;

  // Determine total frame dimensions
  const totalWidth = padding.left + contentWidth + padding.right;
  const totalHeight = padding.top + maxH + padding.bottom;

  // Apply main-axis alignment offset
  let offsetX = padding.left;
  if (alignH === 'center') {
    offsetX = padding.left + (contentWidth - contentWidth) / 2; // no-op for packed
  }

  // Position children
  for (let i = 0; i < children.length; i++) {
    children[i].x = offsetX + positions[i].x;
    children[i].y = padding.top + positions[i].y;
  }

  return { width: totalWidth, height: totalHeight };
}

// ── Layout: Vertical ──

function layoutVertical(children: SceneNode[], config: LayoutConfig): { width: number; height: number } {
  const { alignH, alignV, padding, gap } = config;
  const maxW = Math.max(...children.map(c => c.width));

  // Lay out sequentially
  const positions: { x: number; y: number }[] = [];
  let cursorY = 0;
  for (const child of children) {
    const x = alignOffset(maxW, child.width, alignH);
    positions.push({ x, y: cursorY });
    cursorY += child.height + gap;
  }

  const _contentHeight = cursorY - gap;
  const totalWidth = padding.left + maxW + padding.right;
  const totalHeight = padding.top + _contentHeight + padding.bottom;

  // Position children
  for (let i = 0; i < children.length; i++) {
    children[i].x = padding.left + positions[i].x;
    children[i].y = padding.top + positions[i].y;
  }

  return { width: totalWidth, height: totalHeight };
}

// ── Layout: Grid ──

function layoutGrid(children: SceneNode[], config: LayoutConfig): { width: number; height: number } {
  const { alignH, alignV, padding, gap, gridColumns, gridRows, gridWrap } = config;

  const columns = resolveGridColumns(children.length, gridColumns, gridRows);
  const colWidths = getColumnWidths(children, columns);
  const rowHeights = getRowHeights(children, columns);

  // If wrap is off and we have more items than columns * explicit rows, limit items
  let itemCount = children.length;
  if (!gridWrap && gridRows > 0 && gridColumns > 0) {
    itemCount = Math.min(children.length, gridColumns * gridRows);
  }

  let cursorY = padding.top;
  for (let r = 0; r < rowHeights.length; r++) {
    let cursorX = padding.left;
    for (let c = 0; c < columns; c++) {
      const idx = r * columns + c;
      if (idx >= itemCount) break;

      const child = children[idx];
      child.x = cursorX + alignOffset(colWidths[c], child.width, alignH);
      child.y = cursorY + alignOffset(rowHeights[r], child.height, alignV);
      cursorX += colWidths[c] + gap;
    }
    if ((r + 1) * columns >= itemCount) break;
    cursorY += rowHeights[r] + gap;
  }

  const gridWidth = colWidths.reduce((s, w) => s + w, 0) + gap * (columns - 1);
  const usedRows = Math.ceil(itemCount / columns);
  const usedRowHeights = rowHeights.slice(0, usedRows);
  const gridHeight = usedRowHeights.reduce((s, h) => s + h, 0) + gap * (usedRows - 1);

  return {
    width: padding.left + gridWidth + padding.right,
    height: padding.top + gridHeight + padding.bottom
  };
}

// ── Apply Layout ──

function applyLayout(section: SectionNode, config: LayoutConfig): void {
  const children = sortByPosition(section.children);
  if (children.length === 0) return;

  let size: { width: number; height: number };

  switch (config.layout) {
    case 'horizontal':
      size = layoutHorizontal(children, config);
      break;
    case 'vertical':
      size = layoutVertical(children, config);
      break;
    case 'grid':
      size = layoutGrid(children, config);
      break;
    default:
      size = layoutHorizontal(children, config);
  }

  section.resizeWithoutConstraints(
    Math.max(1, size.width),
    Math.max(1, size.height)
  );
}

// ── Message Handler ──

interface ApplyMessage {
  type: 'apply';
  layout: 'horizontal' | 'vertical' | 'grid';
  alignH: 'start' | 'center' | 'end';
  alignV: 'start' | 'center' | 'end';
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
  gridColumns: number;
  gridRows: number;
  gridWrap: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
figma.ui.onmessage = (msg: any) => {
  if (msg.type === 'cancel') {
    figma.closePlugin();
    return;
  }

  if (msg.type === 'apply') {
    const selection = figma.currentPage.selection;

    if (selection.length === 0 || selection[0].type !== 'SECTION') {
      figma.notify('Please select a Section first.', { error: true });
      return;
    }

    const section = selection[0] as SectionNode;

    if (section.children.length === 0) {
      figma.notify('Section is empty.', { error: true });
      return;
    }

    const pad = msg.padding ?? { top: 32, right: 32, bottom: 32, left: 32 };
    const config: LayoutConfig = {
      layout: msg.layout ?? 'horizontal',
      alignH: msg.alignH ?? 'center',
      alignV: msg.alignV ?? 'center',
      padding: {
        top: Math.max(0, pad.top),
        right: Math.max(0, pad.right),
        bottom: Math.max(0, pad.bottom),
        left: Math.max(0, pad.left)
      },
      gap: Math.max(0, msg.gap ?? 32),
      gridColumns: Math.max(0, Math.min(20, msg.gridColumns ?? 0)),
      gridRows: Math.max(0, Math.min(20, msg.gridRows ?? 0)),
      gridWrap: msg.gridWrap ?? true
    };

    applyLayout(section, config);

    figma.ui.postMessage({ type: 'done' });
    figma.notify(`Arranged ${section.children.length} items in "${section.name}"`);
  }
};
