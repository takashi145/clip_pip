/**
 * 選択結果は viewport 座標（CSS ピクセル）で返す。captureVisibleTab の出力も
 * viewport 基準のため、スクロール量の補正は不要。
 */
import type { Rect } from '../shared/types';
import { UI_TEXT } from '../shared/types';

/** これ未満は誤クリックとみなす。 */
const MIN_SIZE_PX = 8;

const OVERLAY_CSS = `
:host { all: initial; }
.root {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
  font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
        "Noto Sans JP", Meiryo, sans-serif;
}
.dim {
  position: absolute;
  inset: 0;
  background: rgba(17, 17, 20, 0.35);
}
.selection {
  position: absolute;
  display: none;
  box-sizing: border-box;
  border: 1px solid rgba(255, 255, 255, 0.95);
  outline: 1px solid rgba(79, 70, 229, 0.9);
  /* 選択範囲の外側マスクを box-shadow の広がりで表現する */
  box-shadow: 0 0 0 100vmax rgba(17, 17, 20, 0.45);
}
.size {
  position: absolute;
  display: none;
  padding: 3px 7px;
  border-radius: 4px;
  background: rgba(17, 17, 20, 0.85);
  color: #fff;
  white-space: nowrap;
  pointer-events: none;
}
.hint {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(17, 17, 20, 0.85);
  color: #fff;
  pointer-events: none;
}
`;

interface Overlay {
  host: HTMLDivElement;
  selection: HTMLDivElement;
  sizeLabel: HTMLDivElement;
  hint: HTMLDivElement;
  dim: HTMLDivElement;
}

function buildOverlay(): Overlay {
  const host = document.createElement('div');
  // ページ側 CSS の影響を受けないよう最小限のスタイルのみ直接指定する
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0px',
    zIndex: '2147483647',
    margin: '0px',
    padding: '0px',
    border: '0px',
  } satisfies Partial<CSSStyleDeclaration>);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;

  const root = document.createElement('div');
  root.className = 'root';

  const dim = document.createElement('div');
  dim.className = 'dim';

  const selection = document.createElement('div');
  selection.className = 'selection';

  const sizeLabel = document.createElement('div');
  sizeLabel.className = 'size';

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = UI_TEXT.selectHint;

  root.append(dim, selection, sizeLabel, hint);
  shadow.append(style, root);

  return { host, selection, sizeLabel, hint, dim };
}

function normalizeRect(ax: number, ay: number, bx: number, by: number): Rect {
  const x = Math.min(ax, bx);
  const y = Math.min(ay, by);
  return { x, y, width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

function clampToViewport(rect: Rect): Rect {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const x = Math.max(0, Math.min(rect.x, maxW));
  const y = Math.max(0, Math.min(rect.y, maxH));
  return {
    x,
    y,
    width: Math.max(0, Math.min(rect.width, maxW - x)),
    height: Math.max(0, Math.min(rect.height, maxH - y)),
  };
}

/**
 * 範囲選択を開始する。Escape / 右クリック / 極小矩形の場合は null。
 * resolve 前にオーバーレイを DOM から取り除くので、呼び出し側は再描画を待つだけでよい。
 */
export function selectArea(): Promise<Rect | null> {
  return new Promise<Rect | null>((resolve) => {
    const overlay = buildOverlay();
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let settled = false;

    const finish = (rect: Rect | null): void => {
      if (settled) return;
      settled = true;
      teardown();
      resolve(rect);
    };

    const updateSelection = (currentX: number, currentY: number): void => {
      const rect = clampToViewport(normalizeRect(startX, startY, currentX, currentY));
      const { selection, sizeLabel } = overlay;
      selection.style.display = 'block';
      selection.style.left = `${rect.x}px`;
      selection.style.top = `${rect.y}px`;
      selection.style.width = `${rect.width}px`;
      selection.style.height = `${rect.height}px`;

      sizeLabel.style.display = 'block';
      sizeLabel.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
      // ラベルは矩形の下に置き、下端に収まらない場合は内側上部へ退避する
      const below = rect.y + rect.height + 6;
      const fitsBelow = below + 24 < window.innerHeight;
      sizeLabel.style.left = `${Math.min(rect.x, window.innerWidth - 96)}px`;
      sizeLabel.style.top = fitsBelow ? `${below}px` : `${Math.max(0, rect.y + 6)}px`;
    };

    const onMouseDown = (event: MouseEvent): void => {
      if (event.button !== 0) {
        finish(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      overlay.dim.style.display = 'none';
      overlay.hint.style.display = 'none';
      updateSelection(startX, startY);
    };

    const onMouseMove = (event: MouseEvent): void => {
      if (!dragging) return;
      event.preventDefault();
      updateSelection(event.clientX, event.clientY);
    };

    const onMouseUp = (event: MouseEvent): void => {
      if (!dragging) return;
      event.preventDefault();
      event.stopPropagation();
      dragging = false;
      const rect = clampToViewport(normalizeRect(startX, startY, event.clientX, event.clientY));
      finish(rect.width >= MIN_SIZE_PX && rect.height >= MIN_SIZE_PX ? rect : null);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    };

    // 選択中のスクロールは矩形とページ内容をずらすため抑止する
    const blockEvent = (event: Event): void => event.preventDefault();

    const teardown = (): void => {
      overlay.host.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('wheel', blockEvent);
      overlay.host.removeEventListener('contextmenu', blockEvent);
      overlay.host.removeEventListener('dragstart', blockEvent);
      overlay.host.remove();
    };

    overlay.host.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('wheel', blockEvent, { passive: false });
    overlay.host.addEventListener('contextmenu', blockEvent);
    overlay.host.addEventListener('dragstart', blockEvent);

    document.documentElement.append(overlay.host);
  });
}
