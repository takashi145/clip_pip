/**
 * 画像は <canvas> に直接描画する。<img src="data:..."> はページ由来の CSP
 * （img-src）で拒否されうるが、canvas への描画は影響を受けない。
 */
import type { CroppedImage } from '../capture/capture';
import type { Rect } from '../shared/types';
import { PIP_SIZE } from '../shared/types';
import { createCloseButton, createElement, getPipTheme, pipManager } from './pip-manager';

/** 選択矩形のアスペクト比から初期サイズを求める。実際の値はブラウザ側の制限が優先される。 */
export function areaPipSize(rect: Rect): { width: number; height: number } {
  const maxWidth = Math.max(320, Math.floor((window.screen.availWidth || 1280) * 0.9));
  const maxHeight = Math.max(240, Math.floor((window.screen.availHeight || 720) * 0.9));
  const ratio = rect.height / rect.width;

  let width = Math.min(PIP_SIZE.areaWidth, maxWidth);
  let height = Math.round(width * ratio);

  if (height > maxHeight) {
    height = maxHeight;
    width = Math.round(height / ratio);
  }

  return {
    width: Math.max(PIP_SIZE.minWidth, Math.min(width, maxWidth)),
    height: Math.max(PIP_SIZE.minHeight, Math.min(height, maxHeight)),
  };
}

export function renderAreaPip(win: Window, image: CroppedImage): void {
  const doc = win.document;
  const theme = getPipTheme(win);
  doc.body.replaceChildren();

  const stage = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    background: theme.background,
  });

  const canvas = doc.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.style.setProperty('display', 'block');
  canvas.style.setProperty('max-width', '100%');
  canvas.style.setProperty('max-height', '100%');
  canvas.style.setProperty('width', 'auto');
  canvas.style.setProperty('height', 'auto');
  canvas.style.setProperty('object-fit', 'contain');

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is not available in the PiP window');
  }
  context.drawImage(image.bitmap, 0, 0);

  const closeButton = createCloseButton(doc, theme, () => pipManager.close());

  stage.append(canvas);
  doc.body.append(stage, closeButton);

  pipManager.registerCleanup(() => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    image.dispose();
    doc.body.replaceChildren();
  });
}
