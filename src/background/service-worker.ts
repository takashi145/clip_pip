/**
 * Text Pin にはポップアップが無く、content script の注入自体に失敗すると
 * ページ内トーストも出せない。この経路だけはアイコンのバッジとツールチップで
 * 理由を伝える。notifications 権限を増やさずに済ませるための選択。
 */
import { describeFailure, preflightError } from '../shared/failure';
import type { CaptureResult, StartTextPinMessage } from '../shared/types';
import { MessageType } from '../shared/types';

const TEXT_PIN_MENU_ID = 'clippip/text-pin';
const CONTENT_SCRIPT = 'content.js';
const BADGE_CLEAR_DELAY_MS = 8000;

function registerContextMenu(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: TEXT_PIN_MENU_ID,
      title: '選択テキストをPiP表示',
      contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);

async function clearBadge(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: 'ClipPiP' });
  } catch {
    // タブが閉じられている場合は何もしない
  }
}

/**
 * service worker は停止しうるため setTimeout による消去は best-effort。
 * 次回の Text Pin 実行時にも必ずクリアする。
 */
async function reportFailure(tabId: number, message: string): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '!' });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c2410c' });
    await chrome.action.setTitle({ tabId, title: `ClipPiP: ${message}` });
    setTimeout(() => void clearBadge(tabId), BADGE_CLEAR_DELAY_MS);
  } catch (error) {
    console.warn('[ClipPiP] failed to report the error on the action badge', error);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== TEXT_PIN_MENU_ID) return;

  const tabId = tab?.id;
  const selectionText = info.selectionText ?? '';
  if (tabId === undefined || selectionText.trim().length === 0) return;

  await clearBadge(tabId);

  const url = tab?.url ?? tab?.pendingUrl ?? '';
  const preflight = preflightError(url);
  if (preflight) {
    await reportFailure(tabId, preflight);
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    await chrome.tabs.sendMessage(tabId, {
      type: MessageType.StartTextPin,
      fallbackText: selectionText,
    } satisfies StartTextPinMessage);
  } catch (error) {
    console.error('[ClipPiP] failed to start Text Pin', { url, error });
    await reportFailure(tabId, describeFailure(error, url));
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== MessageType.CaptureVisibleTab) return false;

  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    sendResponse({ ok: false, error: 'sender tab is unknown' } satisfies CaptureResult);
    return false;
  }

  chrome.tabs
    .captureVisibleTab(windowId, { format: 'png' })
    .then((dataUrl) => sendResponse({ ok: true, dataUrl } satisfies CaptureResult))
    .catch((error: unknown) =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies CaptureResult),
    );

  // 非同期で応答するためチャネルを開いたままにする
  return true;
});
