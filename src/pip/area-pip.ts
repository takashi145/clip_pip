/**
 * 画像は <canvas> に直接描画する。<img src="data:..."> はページ由来の CSP
 * （img-src）で拒否されうるが、canvas への描画は影響を受けない。
 */
import type { CroppedImage } from '../capture/capture';
import type { Rect } from '../shared/types';
import { PIP_SIZE } from '../shared/types';
import type { PipControl } from './pip-manager';
import { createElement, createPipControls, getPipTheme, pipManager } from './pip-manager';

/** 窓を開いた直後のブラウザ都合のサイズ調整を、ユーザーのリサイズと取り違えないための猶予。 */
const RESIZE_GRACE_MS = 600;

/**
 * 選択範囲と同じ大きさで開く。キャプチャの解像度は画面に表示されていたものが上限で、
 * それより大きい窓で開いても引き伸ばされてぼやけるだけで情報は増えない。
 * 実際の値はブラウザ側の制限が優先される。
 */
export function areaPipSize(rect: Rect): { width: number; height: number } {
  const maxWidth = Math.max(320, Math.floor((window.screen.availWidth || 1280) * 0.9));
  const maxHeight = Math.max(240, Math.floor((window.screen.availHeight || 720) * 0.9));

  // 画面に収まらないときだけ、アスペクト比を保ったまま縮める
  const shrink = Math.min(1, maxWidth / rect.width, maxHeight / rect.height);

  return {
    width: Math.max(PIP_SIZE.minWidth, Math.round(rect.width * shrink)),
    height: Math.max(PIP_SIZE.minHeight, Math.round(rect.height * shrink)),
  };
}

export function renderAreaPip(win: Window, image: CroppedImage, controls: PipControl[] = []): void {
  const doc = win.document;
  const theme = getPipTheme(win);
  doc.body.replaceChildren();

  const stage = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    background: theme.background,
  });

  const canvas = doc.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.style.setProperty('display', 'block');
  canvas.style.setProperty('position', 'absolute');

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is not available in the PiP window');
  }
  context.drawImage(image.bitmap, 0, 0);

  const openedAt = Date.now();
  let baseline: { width: number; height: number } | null = null;
  let userResized = false;

  function layout(): void {
    const dpr = win.devicePixelRatio || 1;
    const availWidth = win.innerWidth;
    const availHeight = win.innerHeight;
    if (availWidth <= 0 || availHeight <= 0) return;
    if (!baseline) baseline = { width: availWidth, height: availHeight };

    const naturalWidth = image.width / dpr;
    const naturalHeight = image.height / dpr;
    const fit = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
    // 既定では等倍を超えて拡大しない。窓を広げられたときだけ、その操作に従う。
    const scale = userResized ? fit : Math.min(1, fit);

    const snap = (value: number): number => Math.round(value * dpr) / dpr;
    const width = snap(naturalWidth * scale);
    const height = snap(naturalHeight * scale);

    canvas.style.setProperty('width', `${width}px`);
    canvas.style.setProperty('height', `${height}px`);
    canvas.style.setProperty('left', `${snap((availWidth - width) / 2)}px`);
    canvas.style.setProperty('top', `${snap((availHeight - height) / 2)}px`);
  }

  const onResize = (): void => {
    const changed =
      baseline !== null &&
      (Math.abs(win.innerWidth - baseline.width) > 1 || Math.abs(win.innerHeight - baseline.height) > 1);
    if (changed && Date.now() - openedAt > RESIZE_GRACE_MS) {
      userResized = true;
    }
    layout();
  };

  stage.append(canvas);
  doc.body.append(stage);
  if (controls.length > 0) doc.body.append(createPipControls(doc, theme, controls));
  layout();
  win.addEventListener('resize', onResize);

  pipManager.registerCleanup(() => {
    win.removeEventListener('resize', onResize);
    context.clearRect(0, 0, canvas.width, canvas.height);
    canvas.width = 0;
    canvas.height = 0;
    image.dispose();
    doc.body.replaceChildren();
  });
}
