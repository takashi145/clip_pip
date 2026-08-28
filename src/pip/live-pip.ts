/**
 * 元タブの映像を流し続ける Live Pin。切り出しに canvas を使わないのは、
 * ヘルパーが背景タブで requestAnimationFrame が絞られ、描き直しが止まるため。
 */
import type { Rect, Viewport } from '../shared/types';
import { UI_TEXT } from '../shared/types';
import type { PipControl } from './pip-manager';
import { createElement, createPipControls, getPipTheme, pipManager } from './pip-manager';

/** 窓を開いた直後のブラウザ都合のサイズ調整を、ユーザーのリサイズと取り違えないための猶予。 */
const RESIZE_GRACE_MS = 600;

export interface LivePipOptions {
  rect: Rect;
  viewport: Viewport;
  controls: PipControl[];
}

export function renderLivePip(win: Window, stream: MediaStream, options: LivePipOptions): void {
  const { rect, viewport, controls } = options;
  const doc = win.document;
  const theme = getPipTheme(win);
  doc.body.replaceChildren();

  const stage = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    background: theme.background,
  });

  // 選択範囲ぶんだけを見せる窓。映像はこの内側で負のオフセットを持つ
  const frame = createElement(doc, 'div', {
    position: 'absolute',
    overflow: 'hidden',
  });

  const video = doc.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  video.style.setProperty('position', 'absolute');
  video.style.setProperty('display', 'block');

  const notice = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    display: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    boxSizing: 'border-box',
    textAlign: 'center',
    background: theme.background,
    color: theme.subtleText,
    fontSize: '13px',
  });
  notice.textContent = UI_TEXT.liveEnded;

  const openedAt = Date.now();
  let baseline: { width: number; height: number } | null = null;
  let userResized = false;
  // ページの CSS 1px あたりの映像ピクセル数。viewport は選択時の値で更新できないため測り直さない
  let captureScale = 0;

  /** 選択範囲が frame にぴったり収まるよう、映像の縮尺と位置を決める。 */
  function layout(): void {
    const dpr = win.devicePixelRatio || 1;
    const availWidth = win.innerWidth;
    const availHeight = win.innerHeight;
    if (availWidth <= 0 || availHeight <= 0) return;
    if (rect.width <= 0 || rect.height <= 0 || viewport.width <= 0) return;
    if (!baseline) baseline = { width: availWidth, height: availHeight };
    const hasVideo = video.videoWidth > 0 && video.videoHeight > 0;
    if (hasVideo && captureScale <= 0) {
      // 映像はページより広い枠で来て黒帯が入りうるので、収まる側の比を取る
      captureScale = Math.min(
        video.videoWidth / viewport.width,
        video.videoHeight / viewport.height,
      );
    }
    const effectiveScale = captureScale > 0 ? captureScale : dpr;

    // 映像全体をページの CSS ピクセルに換算した大きさと、ページ内容までの黒帯ぶんの余白
    const framedWidth = hasVideo ? video.videoWidth / effectiveScale : viewport.width;
    const framedHeight = hasVideo ? video.videoHeight / effectiveScale : viewport.height;
    const padX = (framedWidth - viewport.width) / 2;
    const padY = (framedHeight - viewport.height) / 2;

    // 映像 1px を画面の 1px に対応させたときの大きさ
    const naturalWidth = (rect.width * effectiveScale) / dpr;
    const naturalHeight = (rect.height * effectiveScale) / dpr;

    const fit = Math.min(availWidth / naturalWidth, availHeight / naturalHeight);
    // 既定では等倍を超えて拡大しない。窓を広げられたときだけ従う
    const scale = userResized ? fit : Math.min(1, fit);

    const snap = (value: number): number => Math.round(value * dpr) / dpr;
    // ページの CSS 1px あたりの、PiP 側 CSS ピクセル数
    const display = (naturalWidth * scale) / rect.width;

    const width = snap(rect.width * display);
    const height = snap(rect.height * display);

    frame.style.setProperty('width', `${width}px`);
    frame.style.setProperty('height', `${height}px`);
    frame.style.setProperty('left', `${snap((availWidth - width) / 2)}px`);
    frame.style.setProperty('top', `${snap((availHeight - height) / 2)}px`);

    // 黒帯を含む映像全体を置き、余白ぶんだけ余分にずらす
    video.style.setProperty('width', `${framedWidth * display}px`);
    video.style.setProperty('height', `${framedHeight * display}px`);
    video.style.setProperty('left', `${-(rect.x + padX) * display}px`);
    video.style.setProperty('top', `${-(rect.y + padY) * display}px`);
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

  /** 元タブが閉じられるとトラックが終わる。映像は戻らない。 */
  const onEnded = (): void => {
    frame.style.setProperty('display', 'none');
    notice.style.setProperty('display', 'flex');
  };

  const [track] = stream.getVideoTracks();
  track?.addEventListener('ended', onEnded);
  video.addEventListener('loadedmetadata', layout);
  // 元タブのウィンドウが動くと映像の解像度が変わる
  video.addEventListener('resize', layout);
  win.addEventListener('resize', onResize);

  frame.append(video);
  stage.append(frame, notice);
  doc.body.append(stage);
  // autoplay 属性だけだと再生されず真っ暗のままになることがある
  void video.play().catch((error: unknown) => {
    console.warn('[ClipPiP] failed to start the live video', error);
  });
  if (controls.length > 0) doc.body.append(createPipControls(doc, theme, controls));
  layout();

  pipManager.registerCleanup(() => {
    win.removeEventListener('resize', onResize);
    video.removeEventListener('loadedmetadata', layout);
    video.removeEventListener('resize', layout);
    track?.removeEventListener('ended', onEnded);
    for (const stopping of stream.getTracks()) stopping.stop();
    video.srcObject = null;
    doc.body.replaceChildren();
  });
}
