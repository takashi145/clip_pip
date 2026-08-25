import type { Rect, Viewport } from '../shared/types';

/** 切り出し済み画像。使い終わったら dispose() で破棄する。 */
export interface CroppedImage {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
  dispose(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * 可視タブのスクリーンショット（data URL）から、viewport 座標の矩形を切り出す。
 *
 * デコードとクロップを createImageBitmap で行うのは、<img> や blob: URL を
 * 経由せずに済ませるため。ページ側の CSP（img-src）の影響を受けない。
 */
export async function cropCapture(
  dataUrl: string,
  rect: Rect,
  viewport: Viewport,
): Promise<CroppedImage> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const full = await createImageBitmap(blob);

  try {
    if (viewport.width <= 0 || viewport.height <= 0) {
      throw new Error('viewport size is not available');
    }

    // devicePixelRatio を直接使わず実測比を取ることで、高 DPI とブラウザズームを
    // 同じ経路で吸収する
    const scaleX = full.width / viewport.width;
    const scaleY = full.height / viewport.height;

    const sx = clamp(Math.round(rect.x * scaleX), 0, Math.max(0, full.width - 1));
    const sy = clamp(Math.round(rect.y * scaleY), 0, Math.max(0, full.height - 1));
    const sw = clamp(Math.round(rect.width * scaleX), 1, full.width - sx);
    const sh = clamp(Math.round(rect.height * scaleY), 1, full.height - sy);

    const cropped = await createImageBitmap(full, sx, sy, sw, sh);
    let disposed = false;

    return {
      bitmap: cropped,
      width: cropped.width,
      height: cropped.height,
      dispose(): void {
        if (disposed) return;
        disposed = true;
        cropped.close();
      },
    };
  } finally {
    full.close();
  }
}
