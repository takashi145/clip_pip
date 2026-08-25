/**
 * コンテキストメニュー経由の実行にはポップアップが無く、content script の注入
 * 自体に失敗するとページ内トーストも出せない。この経路だけはアイコンのバッジと
 * ツールチップで理由を伝える。notifications 権限を増やさずに済ませるための選択。
 */
import { describeFailure, preflightError } from '../shared/failure';
import type { CaptureResult, ContentMessage } from '../shared/types';
import { formatBadgeErrorTitle, MessageType, UI_TEXT } from '../shared/types';

const MENU_ID = {
  areaPin: 'clippip/area-pin',
  textPin: 'clippip/text-pin',
} as const;

const CONTENT_SCRIPT = 'content.js';
const BADGE_CLEAR_DELAY_MS = 8000;

/**
 * selection と、それ以外の context は排他なので、右クリックの状況に応じて
 * どちらか一方だけがメニューに出る。入れ子にせず並列に登録する。
 * editable は入力欄のメニューを埋めたくないため対象外。
 */
function registerContextMenus(): void {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID.areaPin,
      title: UI_TEXT.contextMenuAreaPin,
      contexts: ['page', 'image', 'link', 'video', 'audio', 'frame'],
    });
    chrome.contextMenus.create({
      id: MENU_ID.textPin,
      title: UI_TEXT.contextMenuTextPin,
      contexts: ['selection'],
    });
  });
}

chrome.runtime.onInstalled.addListener(registerContextMenus);
chrome.runtime.onStartup.addListener(registerContextMenus);

async function clearBadge(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
    await chrome.action.setTitle({ tabId, title: UI_TEXT.badgeDefaultTitle });
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
    await chrome.action.setTitle({ tabId, title: formatBadgeErrorTitle(message) });
    setTimeout(() => void clearBadge(tabId), BADGE_CLEAR_DELAY_MS);
  } catch (error) {
    console.warn('[ClipPiP] failed to report the error on the action badge', error);
  }
}

/** クリックされたメニューから、content script へ送るメッセージを決める。 */
function toContentMessage(info: chrome.contextMenus.OnClickData): ContentMessage | null {
  if (info.menuItemId === MENU_ID.areaPin) {
    return { type: MessageType.StartAreaPin };
  }
  if (info.menuItemId === MENU_ID.textPin) {
    const fallbackText = info.selectionText ?? '';
    if (fallbackText.trim().length === 0) return null;
    return { type: MessageType.StartTextPin, fallbackText };
  }
  return null;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  const message = toContentMessage(info);
  if (tabId === undefined || !message) return;

  await clearBadge(tabId);

  const url = tab?.url ?? tab?.pendingUrl ?? '';
  const preflight = preflightError(url);
  if (preflight) {
    await reportFailure(tabId, preflight);
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('[ClipPiP] failed to start from the context menu', { url, error });
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
