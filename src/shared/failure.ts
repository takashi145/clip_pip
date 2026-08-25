import { UI_TEXT } from './types';

const BROWSER_INTERNAL_URL = /^(chrome|chrome-untrusted|chrome-extension|edge|devtools|view-source):/i;
const WEBSTORE_URL = /^https:\/\/(chromewebstore\.google\.com|chrome\.google\.com\/webstore)/i;
const PDF_URL = /\.pdf(?:[?#]|$)/i;

/**
 * 注入する前に除外できるページかを判定する。除外しない場合は null。
 *
 * 拒否リストで先回りしすぎると、実際には動くページ（file: など）まで誤って弾く。
 * ここでは確実に不可能なものだけを対象にし、残りは注入を試して失敗を見る。
 */
export function preflightError(url: string): string | null {
  if (!url) return null;
  if (BROWSER_INTERNAL_URL.test(url) || WEBSTORE_URL.test(url)) return UI_TEXT.restrictedPage;
  if (PDF_URL.test(url)) return UI_TEXT.pdfNotSupported;
  return null;
}

/**
 * executeScript / sendMessage の失敗を、原因に応じた文言へ変換する。
 * Chrome のエラーメッセージの文面に依存するため、判定は緩めにして
 * 該当しないものは汎用メッセージへ落とす。
 */
export function describeFailure(error: unknown, url: string): string {
  const message = error instanceof Error ? error.message : String(error);

  // file: は「ファイルのURLへのアクセス」が無効だと注入できない
  if (/^file:/i.test(url) && /cannot access|must request permission/i.test(message)) {
    return UI_TEXT.fileAccessRequired;
  }
  if (/chrome-error:|no tab with id|was removed|no frame with id|receiving end does not exist/i.test(message)) {
    return UI_TEXT.reloadRequired;
  }
  if (/cannot access|must request permission|cannot be scripted/i.test(message)) {
    return UI_TEXT.restrictedPage;
  }
  return UI_TEXT.startFailed;
}
