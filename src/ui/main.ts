import './styles.css';
import {
  bindFieldFocus,
  bindSegmented,
  byId,
  clear,
  onPluginMessage,
  postToPlugin,
  readNumber,
  setVisible,
} from '../../ui-kit/kit.ts';
import type { Align, LayoutMode, Sizing } from '../layout.ts';
import { DEFAULT_CONFIG } from '../messages.ts';
import type {
  CustomValues,
  ErrorReason,
  PluginMessage,
  SelectionState,
  StoredConfig,
  UiMessage,
  ValueCategory,
} from '../messages.ts';

const PRESETS = [64, 128, 256, 512];

const EMPTY_MESSAGES: Record<ErrorReason, string> = {
  'no-selection': 'Select a section to organize.',
  'not-a-section': 'The selected layer is not a section.',
  'empty-section': 'This section is empty. Add frames first.',
};

const SIZING_HINTS: Record<Sizing, string> = {
  hug: 'The section resizes to fit its content.',
  fixed: 'The section keeps its current size and the content aligns inside it.',
};

const el = {
  emptyView: byId('emptyView'),
  emptyMessage: byId('emptyMessage'),
  emptySettings: byId<HTMLButtonElement>('emptySettings'),
  mainView: byId('mainView'),
  settingsView: byId('settingsView'),
  sectionName: byId('sectionName'),
  sectionCount: byId('sectionCount'),
  openSettings: byId<HTMLButtonElement>('openSettings'),
  closeSettings: byId<HTMLButtonElement>('closeSettings'),
  directionGroup: byId('directionGroup'),
  alignGrid: byId('alignGrid'),
  sizingGroup: byId('sizingGroup'),
  sizingHint: byId('sizingHint'),
  gap: byId<HTMLInputElement>('gap'),
  gapChips: byId('gapChips'),
  padModeToggle: byId<HTMLButtonElement>('padModeToggle'),
  padSingle: byId('padSingle'),
  padMulti: byId('padMulti'),
  padAll: byId<HTMLInputElement>('padAll'),
  padTop: byId<HTMLInputElement>('padTop'),
  padRight: byId<HTMLInputElement>('padRight'),
  padBottom: byId<HTMLInputElement>('padBottom'),
  padLeft: byId<HTMLInputElement>('padLeft'),
  padChips: byId('padChips'),
  padSideChips: byId('padSideChips'),
  gridGroup: byId('gridGroup'),
  gridColumns: byId<HTMLInputElement>('gridColumns'),
  gridRows: byId<HTMLInputElement>('gridRows'),
  gridWrap: byId<HTMLInputElement>('gridWrap'),
  apply: byId<HTMLButtonElement>('apply'),
  gapValueList: byId('gapValueList'),
  padValueList: byId('padValueList'),
};

let config: StoredConfig = { ...DEFAULT_CONFIG };
let customValues: CustomValues = { gap: [], pad: [] };
let selectionValid = false;
let appliedTimer = 0;

function send(message: UiMessage): void {
  postToPlugin(message);
}

function renderAlignGrid(): void {
  const aligns: Align[] = ['start', 'center', 'end'];
  for (const v of aligns) {
    for (const h of aligns) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'align-dot';
      dot.setAttribute('role', 'radio');
      dot.dataset.h = h;
      dot.dataset.v = v;
      dot.setAttribute('aria-label', `Align ${v} ${h}`);
      dot.addEventListener('click', () => {
        config = { ...config, alignH: h, alignV: v };
        syncAlignGrid();
      });
      el.alignGrid.appendChild(dot);
    }
  }

  el.alignGrid.addEventListener('keydown', (event: KeyboardEvent) => {
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (dx === 0 && dy === 0) return;
    event.preventDefault();
    const aligns: Align[] = ['start', 'center', 'end'];
    const nextH = aligns[Math.min(2, Math.max(0, aligns.indexOf(config.alignH) + dx))];
    const nextV = aligns[Math.min(2, Math.max(0, aligns.indexOf(config.alignV) + dy))];
    config = { ...config, alignH: nextH ?? config.alignH, alignV: nextV ?? config.alignV };
    syncAlignGrid();
    activeDot()?.focus();
  });
}

function activeDot(): HTMLButtonElement | null {
  return el.alignGrid.querySelector<HTMLButtonElement>(
    `[data-h="${config.alignH}"][data-v="${config.alignV}"]`,
  );
}

function syncAlignGrid(): void {
  el.alignGrid.dataset.h = config.alignH;
  el.alignGrid.dataset.v = config.alignV;
  for (const dot of Array.from(el.alignGrid.querySelectorAll<HTMLButtonElement>('.align-dot'))) {
    const selected = dot.dataset.h === config.alignH && dot.dataset.v === config.alignV;
    dot.setAttribute('aria-checked', String(selected));
    dot.tabIndex = selected ? 0 : -1;
  }
}

function applyPresetTo(category: ValueCategory, value: number, sidesOnly: boolean): void {
  if (category === 'gap') {
    el.gap.value = String(value);
    return;
  }
  if (!sidesOnly) el.padAll.value = String(value);
  for (const input of [el.padTop, el.padRight, el.padBottom, el.padLeft]) {
    input.value = String(value);
  }
}

function renderChipRow(container: HTMLElement, category: ValueCategory, sidesOnly: boolean): void {
  clear(container);

  const values = [...PRESETS, ...customValues[category].filter((v) => !PRESETS.includes(v))];
  for (const value of values) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = PRESETS.includes(value) ? 'fig-chip' : 'fig-chip fig-chip--custom';
    chip.textContent = String(value);
    chip.addEventListener('click', () => applyPresetTo(category, value, sidesOnly));
    container.appendChild(chip);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'fig-chip fig-chip--add';
  add.textContent = '+';
  add.title = 'Add a custom value';
  add.addEventListener('click', () => promptForValue(container, category, add));
  container.appendChild(add);
}

function promptForValue(
  container: HTMLElement,
  category: ValueCategory,
  add: HTMLButtonElement,
): void {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'chip-input';
  input.min = '0';
  input.max = '2000';
  input.placeholder = 'px';
  container.replaceChild(input, add);
  input.focus();

  let settled = false;
  const restore = (): void => {
    if (input.parentNode === container) container.replaceChild(add, input);
  };
  const commit = (): void => {
    if (settled) return;
    settled = true;
    const value = Number.parseInt(input.value, 10);
    if (Number.isFinite(value) && value >= 0) send({ type: 'save-value', category, value });
    else restore();
  };

  input.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    }
    if (event.key === 'Escape') {
      settled = true;
      restore();
    }
  });
  input.addEventListener('blur', commit);
}

function renderChips(): void {
  renderChipRow(el.gapChips, 'gap', false);
  renderChipRow(el.padChips, 'pad', false);
  renderChipRow(el.padSideChips, 'pad', true);
}

function renderValueList(container: HTMLElement, category: ValueCategory): void {
  clear(container);
  const values = customValues[category];
  if (values.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'fig-hint';
    empty.textContent = 'No custom values yet.';
    container.appendChild(empty);
    return;
  }

  for (const value of values) {
    const row = document.createElement('div');
    row.className = 'fig-list__row';

    const name = document.createElement('span');
    name.className = 'fig-list__name';
    name.textContent = String(value);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'fig-btn fig-btn--icon';
    remove.title = `Delete ${value}`;
    remove.innerHTML =
      '<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    remove.addEventListener('click', () => send({ type: 'delete-value', category, value }));

    row.append(name, remove);
    container.appendChild(row);
  }
}

function renderValueLists(): void {
  renderValueList(el.gapValueList, 'gap');
  renderValueList(el.padValueList, 'pad');
}

function syncPadMode(): void {
  el.padModeToggle.setAttribute('aria-pressed', String(config.padMulti));
  setVisible(el.padSingle, !config.padMulti);
  setVisible(el.padMulti, config.padMulti);
}

function syncSizing(): void {
  el.sizingHint.textContent = SIZING_HINTS[config.sizing];
}

function readForm(): StoredConfig {
  return {
    ...config,
    gap: readNumber(el.gap, DEFAULT_CONFIG.gap),
    padAll: readNumber(el.padAll, DEFAULT_CONFIG.padAll),
    padTop: readNumber(el.padTop, DEFAULT_CONFIG.padTop),
    padRight: readNumber(el.padRight, DEFAULT_CONFIG.padRight),
    padBottom: readNumber(el.padBottom, DEFAULT_CONFIG.padBottom),
    padLeft: readNumber(el.padLeft, DEFAULT_CONFIG.padLeft),
    gridColumns: readNumber(el.gridColumns, 0),
    gridRows: readNumber(el.gridRows, 0),
    gridWrap: el.gridWrap.checked,
  };
}

function writeForm(next: StoredConfig): void {
  config = next;
  selectDirection(config.layout);
  selectSizing(config.sizing);
  syncAlignGrid();
  syncPadMode();
  syncSizing();
  setVisible(el.gridGroup, config.layout === 'grid');
  el.gap.value = String(config.gap);
  el.padAll.value = String(config.padAll);
  el.padTop.value = String(config.padTop);
  el.padRight.value = String(config.padRight);
  el.padBottom.value = String(config.padBottom);
  el.padLeft.value = String(config.padLeft);
  el.gridColumns.value = String(config.gridColumns);
  el.gridRows.value = String(config.gridRows);
  el.gridWrap.checked = config.gridWrap;
}

function showSelection(selection: SelectionState): void {
  selectionValid = selection.valid;
  if (selection.valid) {
    el.sectionName.textContent = selection.name;
    el.sectionCount.textContent = `${selection.count} ${selection.count === 1 ? 'item' : 'items'}`;
  } else {
    el.emptyMessage.textContent = EMPTY_MESSAGES[selection.reason];
  }
  if (el.settingsView.hidden) {
    setVisible(el.mainView, selection.valid);
    setVisible(el.emptyView, !selection.valid);
  }
}

function openSettings(): void {
  renderValueLists();
  setVisible(el.settingsView, true);
  setVisible(el.mainView, false);
  setVisible(el.emptyView, false);
  el.closeSettings.focus();
}

function closeSettings(): void {
  setVisible(el.settingsView, false);
  setVisible(el.mainView, selectionValid);
  setVisible(el.emptyView, !selectionValid);
}

const selectDirection = bindSegmented(el.directionGroup, (value) => {
  config = { ...config, layout: value as LayoutMode };
  setVisible(el.gridGroup, config.layout === 'grid');
});

const selectSizing = bindSegmented(el.sizingGroup, (value) => {
  config = { ...config, sizing: value as Sizing };
  syncSizing();
});

el.padModeToggle.addEventListener('click', () => {
  config = { ...config, padMulti: !config.padMulti };
  if (config.padMulti) {
    for (const input of [el.padTop, el.padRight, el.padBottom, el.padLeft]) {
      input.value = el.padAll.value;
    }
  } else {
    el.padAll.value = el.padTop.value;
  }
  syncPadMode();
});

el.padAll.addEventListener('input', () => {
  for (const input of [el.padTop, el.padRight, el.padBottom, el.padLeft]) {
    input.value = el.padAll.value;
  }
});

el.apply.addEventListener('click', () => {
  config = readForm();
  send({ type: 'apply', config });
});

el.openSettings.addEventListener('click', openSettings);
el.emptySettings.addEventListener('click', openSettings);
el.closeSettings.addEventListener('click', closeSettings);

document.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key === 'Escape' && !el.settingsView.hidden) closeSettings();
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && selectionValid) {
    el.apply.click();
  }
});

onPluginMessage<PluginMessage>((message) => {
  switch (message.type) {
    case 'init':
      writeForm(message.config ?? DEFAULT_CONFIG);
      customValues = message.values;
      renderChips();
      showSelection(message.selection);
      return;
    case 'selection':
      showSelection(message.selection);
      return;
    case 'values':
      customValues = message.values;
      renderChips();
      if (!el.settingsView.hidden) renderValueLists();
      return;
    case 'applied':
      el.apply.classList.add('fig-btn--success');
      el.apply.textContent = 'Done';
      window.clearTimeout(appliedTimer);
      appliedTimer = window.setTimeout(() => {
        el.apply.classList.remove('fig-btn--success');
        el.apply.textContent = 'Apply';
      }, 900);
      return;
  }
});

renderAlignGrid();
bindFieldFocus();
writeForm(DEFAULT_CONFIG);
renderChips();
