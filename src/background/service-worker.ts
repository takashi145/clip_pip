/**
 * コンテキストメニュー経由の実行にはポップアップが無く、content script の注入
 * 自体に失敗するとページ内トーストも出せない。この経路だけはアイコンのバッジと
 * ツールチップで理由を伝える。notifications 権限を増やさずに済ませるための選択。
 */
import { describeFailure, preflightError } from '../shared/failure';
import { focusSourceTab } from '../shared/source-tab';
import type { Ack, CaptureResult, ContentMessage, PersistentPipState } from '../shared/types';
import { formatBadgeErrorTitle, MessageType, SESSION_KEY, UI_TEXT } from '../shared/types';

const MENU_ID = {
  areaPin: 'clippip/area-pin',
  textPin: 'clippip/text-pin',
} as const;

const CONTENT_SCRIPT = 'content.js';
const HELPER_PAGE = 'helper.html';
const BADGE_CLEAR_DELAY_MS = 8000;

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

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

async function captureVisibleTab(sender: chrome.runtime.MessageSender): Promise<CaptureResult> {
  const windowId = sender.tab?.windowId;
  if (windowId === undefined) {
    return { ok: false, error: 'sender tab is unknown' };
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    return { ok: true, dataUrl };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/*
 * ヘルパーウィンドウ経由の PiP。
 *
 * Document PiP の窓は opener の document に所有されるため、ページを opener に
 * すると、そのタブを閉じた時点で PiP も閉じてしまう。代わりに拡張機能のページを
 * 開いて opener を任せ、PiP を開いた直後に最小化する。
 *
 * service worker は停止しうるので、状態はメモリではなく storage.session に持つ。
 */

async function helperTabId(): Promise<number | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY.helperTabId);
  const id = stored[SESSION_KEY.helperTabId];
  return typeof id === 'number' ? id : null;
}

async function legacyHelperWindowId(): Promise<number | null> {
  const stored = await chrome.storage.session.get(SESSION_KEY.helperWindowId);
  const id = stored[SESSION_KEY.helperWindowId];
  return typeof id === 'number' ? id : null;
}

async function forgetHelper(): Promise<void> {
  await chrome.storage.session.remove([
    SESSION_KEY.helperTabId,
    SESSION_KEY.sourceTabId,
    SESSION_KEY.payload,
    SESSION_KEY.helperWindowId,
  ]);
}

async function isHelperOpen(): Promise<boolean> {
  const id = await helperTabId();
  if (id === null) return false;
  try {
    await chrome.tabs.get(id);
    return true;
  } catch {
    return false;
  }
}

async function closeHelper(): Promise<Ack> {
  const id = await helperTabId();
  const legacyWindowId = await legacyHelperWindowId();
  await forgetHelper();

  if (id !== null) {
    try {
      await chrome.tabs.remove(id);
    } catch {
      // 既に閉じられている
    }
  }
  if (legacyWindowId !== null) {
    try {
      await chrome.windows.remove(legacyWindowId);
    } catch {
      // 既に閉じられている
    }
  }
  return { ok: true };
}

async function waitForHelperReady(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete') return;
    } catch {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
  }
}

/** 選択操作より先に、不可視の opener を用意してメッセージ受信可能にする。 */
async function prepareHelper(sender: chrome.runtime.MessageSender): Promise<Ack> {
  try {
    const sourceTabId = sender.tab?.id;
    const sourceWindowId = sender.tab?.windowId;
    if (sourceTabId === undefined || sourceWindowId === undefined) {
      throw new Error('source tab is unknown');
    }

    await closeHelper();
    const created = await chrome.tabs.create({
      url: chrome.runtime.getURL(HELPER_PAGE),
      windowId: sourceWindowId,
      active: false,
      pinned: true,
      index: 0,
    });
    if (created.id === undefined) throw new Error('the helper tab was not created');

    await chrome.storage.session.set({
      [SESSION_KEY.helperTabId]: created.id,
      [SESSION_KEY.sourceTabId]: sourceTabId,
    });
    await waitForHelperReady(created.id);
    return { ok: true };
  } catch (error) {
    console.error('[ClipPiP] failed to prepare the helper tab', error);
    await forgetHelper();
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** 自動開始できなかった場合だけ、クリック可能な状態でヘルパーを表示する。 */
async function showHelper(): Promise<Ack> {
  const tabId = await helperTabId();
  if (tabId === null) return { ok: false, error: 'helper tab is unknown' };
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}

/** フォールバック画面で PiP を開いた後、元タブへ戻す。既に閉じていれば何もしない。 */
async function restoreSourceTab(): Promise<Ack> {
  await focusSourceTab();
  return { ok: true };
}

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    if ((await helperTabId()) !== tabId) return;
    await forgetHelper();
  })();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case MessageType.CaptureVisibleTab:
      void captureVisibleTab(sender).then(sendResponse);
      break;
    case MessageType.PreparePersistentPip:
      void prepareHelper(sender).then(sendResponse);
      break;
    case MessageType.ShowPersistentPipHelper:
      void showHelper().then(sendResponse);
      break;
    case MessageType.QueryPersistentPip:
      void isHelperOpen().then((open) => sendResponse({ open } satisfies PersistentPipState));
      break;
    case MessageType.ClosePersistentPip:
      void closeHelper().then(sendResponse);
      break;
    case MessageType.PersistentPipOpened:
      void restoreSourceTab().then(sendResponse);
      break;
    default:
      return false;
  }

  // 非同期で応答するためチャネルを開いたままにする
  return true;
});
