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

function toCroppedImage(bitmap: ImageBitmap): CroppedImage {
  let disposed = false;
  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      bitmap.close();
    },
  };
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

    // 幅ではなく左右の辺をそれぞれ丸める。幅を独立に丸めると選択範囲の縁が 1px ずれる。
    const left = clamp(Math.round(rect.x * scaleX), 0, Math.max(0, full.width - 1));
    const top = clamp(Math.round(rect.y * scaleY), 0, Math.max(0, full.height - 1));
    const right = clamp(Math.round((rect.x + rect.width) * scaleX), left + 1, full.width);
    const bottom = clamp(Math.round((rect.y + rect.height) * scaleY), top + 1, full.height);

    return toCroppedImage(await createImageBitmap(full, left, top, right - left, bottom - top));
  } finally {
    full.close();
  }
}

/**
 * 別ウィンドウへ画像を渡すための PNG data URL 化。ImageBitmap はメッセージにも
 * chrome.storage にも載せられないため。PNG は可逆なので画質は落ちない。
 */
export async function encodeImage(image: CroppedImage): Promise<string> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2d context is not available for encoding');
  }
  context.drawImage(image.bitmap, 0, 0);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('failed to read the blob')));
    reader.readAsDataURL(blob);
  });
}

/** encodeImage() の逆。 */
export async function decodeImage(dataUrl: string): Promise<CroppedImage> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return toCroppedImage(await createImageBitmap(blob));
}
