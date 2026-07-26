import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrange, readingOrder, resolveGridColumns } from './layout.ts';
import type { Box, LayoutConfig } from './layout.ts';

const NO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

function config(overrides: Partial<LayoutConfig> = {}): LayoutConfig {
  return {
    layout: 'horizontal',
    alignH: 'start',
    alignV: 'start',
    padding: NO_PADDING,
    gap: 10,
    gridColumns: 0,
    gridRows: 0,
    gridWrap: true,
    sizing: 'hug',
    ...overrides,
  };
}

function box(x: number, y: number, width: number, height: number): Box {
  return { x, y, width, height };
}

test('reading order sorts by row then by column', () => {
  const items = [box(100, 0, 10, 10), box(0, 0, 10, 10), box(0, 50, 10, 10)];
  assert.deepEqual(
    readingOrder(items).map((item) => [item.x, item.y]),
    [
      [0, 0],
      [100, 0],
      [0, 50],
    ],
  );
});

test('horizontal packs along x and reports the hugged size', () => {
  const items = [box(0, 0, 20, 30), box(0, 0, 40, 10)];
  const result = arrange(items, config(), null);

  assert.deepEqual(result.placements, [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
  ]);
  assert.equal(result.width, 70);
  assert.equal(result.height, 30);
});

test('horizontal aligns the cross axis inside the tallest item', () => {
  const items = [box(0, 0, 20, 30), box(0, 0, 20, 10)];
  const result = arrange(items, config({ alignV: 'center' }), null);

  assert.equal(result.placements[1]?.y, 10);
});

test('vertical stacks along y and aligns the cross axis', () => {
  const items = [box(0, 0, 40, 10), box(0, 0, 20, 10)];
  const result = arrange(items, config({ layout: 'vertical', alignH: 'end' }), null);

  assert.deepEqual(result.placements, [
    { x: 0, y: 0 },
    { x: 20, y: 20 },
  ]);
  assert.equal(result.width, 40);
  assert.equal(result.height, 30);
});

test('hug ignores the main axis alignment because there is no slack', () => {
  const items = [box(0, 0, 20, 20), box(0, 0, 20, 20)];
  const start = arrange(items, config({ alignH: 'start' }), null);
  const end = arrange(items, config({ alignH: 'end' }), null);

  assert.deepEqual(start.placements, end.placements);
});

test('fixed sizing makes the main axis alignment take effect', () => {
  const items = [box(0, 0, 20, 20), box(0, 0, 20, 20)];
  const available = box(0, 0, 200, 100);

  const start = arrange(items, config({ alignH: 'start', sizing: 'fixed' }), available);
  const center = arrange(items, config({ alignH: 'center', sizing: 'fixed' }), available);
  const end = arrange(items, config({ alignH: 'end', sizing: 'fixed' }), available);

  assert.equal(start.placements[0]?.x, 0);
  assert.equal(center.placements[0]?.x, 75);
  assert.equal(end.placements[0]?.x, 150);
  assert.equal(start.width, 200);
  assert.equal(start.height, 100);
});

test('a fixed box smaller than the content never clips it', () => {
  const items = [box(0, 0, 100, 100), box(0, 0, 100, 100)];
  const result = arrange(items, config({ sizing: 'fixed' }), box(0, 0, 10, 10));

  assert.equal(result.width, 210);
  assert.equal(result.height, 100);
});

test('grid columns resolve from explicit columns, rows, then a square guess', () => {
  assert.equal(resolveGridColumns(10, 3, 0), 3);
  assert.equal(resolveGridColumns(10, 0, 2), 5);
  assert.equal(resolveGridColumns(2, 0, 0), 2);
  assert.equal(resolveGridColumns(9, 0, 0), 3);
  assert.equal(resolveGridColumns(1, 5, 0), 1);
});

test('grid lays out rows of equal track sizes', () => {
  const items = [box(0, 0, 20, 20), box(0, 0, 20, 20), box(0, 0, 20, 20), box(0, 0, 20, 20)];
  const result = arrange(items, config({ layout: 'grid', gridColumns: 2 }), null);

  assert.deepEqual(result.placements, [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 0, y: 30 },
    { x: 30, y: 30 },
  ]);
  assert.equal(result.width, 50);
  assert.equal(result.height, 50);
});

test('grid without wrap puts everything in one row', () => {
  const items = [box(0, 0, 20, 20), box(0, 0, 20, 20), box(0, 0, 20, 20)];
  const result = arrange(items, config({ layout: 'grid', gridColumns: 2, gridWrap: false }), null);

  assert.equal(result.height, 20);
  assert.equal(result.placements.length, 3);
  assert.deepEqual(
    result.placements.map((placement) => placement.y),
    [0, 0, 0],
  );
});

test('auto keeps the rows the user already arranged', () => {
  const items = [box(0, 0, 20, 20), box(500, 4, 20, 20), box(0, 300, 20, 20)];
  const result = arrange(items, config({ layout: 'auto' }), null);

  assert.deepEqual(result.placements, [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 0, y: 30 },
  ]);
  assert.equal(result.width, 50);
  assert.equal(result.height, 50);
});

test('an empty selection produces an empty arrangement', () => {
  const result = arrange([], config(), null);
  assert.deepEqual(result, { placements: [], width: 0, height: 0 });
});
