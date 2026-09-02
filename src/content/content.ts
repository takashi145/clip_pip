/**
 * 必要なときだけ注入されるため、同じタブへ複数回注入されうる。
 * リスナーの重複登録をグローバルフラグで防ぐ。
 */
import { cropCapture, encodeImage } from '../capture/capture';
import type { CroppedImage } from '../capture/capture';
import { isDocumentPipSupported, pipManager } from '../pip/pip-manager';
import type {
  Ack,
  CaptureResult,
  ContentMessage,
  PersistentPipState,
  PipPayload,
} from '../shared/types';
import { setConfirmSwitch, shouldConfirmSwitch } from '../shared/settings';
import { LIVE_RETRY_ERROR, MessageType, UI_TEXT } from '../shared/types';
import { selectArea } from './area-selector';
import { getSelectedText } from './text-selection';

const LOADED_FLAG = '__clipPipContentLoaded__';

const TOAST_CSS = `
:host { all: initial; }
.toast {
  position: fixed;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: min(560px, calc(100vw - 32px));
  padding: 11px 16px;
  border-radius: 10px;
  background: rgba(17, 17, 20, 0.94);
  color: #f2f2f5;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.32);
  font: 400 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
        "Noto Sans JP", Meiryo, sans-serif;
}
.message { flex: 1 1 auto; }
button {
  flex: 0 0 auto;
  padding: 6px 14px;
  border: 0;
  border-radius: 6px;
  background: #4f46e5;
  color: #fff;
  font: 600 13px/1.2 inherit;
  cursor: pointer;
}
button:hover { background: #4338ca; }
`;

interface ToastHandle {
  dismiss(): void;
}

interface ToastAction {
  label: string;
  onClick(): void;
}

/** ページ側 CSS から隔離したトースト土台を作る。 */
function mountToast(message: string): { host: HTMLDivElement; toast: HTMLDivElement } {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = TOAST_CSS;

  const toast = document.createElement('div');
  toast.className = 'toast';

  const text = document.createElement('span');
  text.className = 'message';
  text.textContent = message;
  toast.append(text);

  shadow.append(style, toast);
  return { host, toast };
}

function showToast(message: string, options: { action?: ToastAction; timeoutMs?: number } = {}): ToastHandle {
  const { host, toast } = mountToast(message);

  let timer: number | undefined;
  const dismiss = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    host.remove();
  };

  if (options.action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = options.action.label;
    button.addEventListener('click', options.action.onClick);
    toast.append(button);
  }

  document.documentElement.append(host);

  const timeoutMs = options.timeoutMs ?? 4000;
  if (timeoutMs > 0) {
    timer = window.setTimeout(dismiss, timeoutMs);
  }

  return { dismiss };
}

const CONFIRM_CSS = `
:host { all: initial; }
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(10, 10, 14, 0.55);
  font: 400 13px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans",
        "Noto Sans JP", Meiryo, sans-serif;
}
.dialog {
  width: min(420px, 100%);
  padding: 20px 22px 18px;
  border-radius: 12px;
  background: #ffffff;
  color: #1a1a1f;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}
.title {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
}
.mark {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #f59e0b;
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
}
.body { margin: 0 0 16px; color: #4b4b57; }
.dont-ask {
  display: flex;
  align-items: center;
  gap: 7px;
  color: #4b4b57;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
}
.dont-ask input { margin: 0; cursor: pointer; }
.actions { display: flex; align-items: center; gap: 8px; margin-top: 16px; }
.actions .spacer { flex: 1 1 auto; }
button {
  padding: 8px 16px;
  border: 0;
  border-radius: 7px;
  font: 600 13px/1.2 inherit;
  cursor: pointer;
}
button.primary { background: #4f46e5; color: #fff; }
button.primary:hover { background: #4338ca; }
button.secondary { background: rgba(17, 17, 20, 0.07); color: #1a1a1f; }
button.secondary:hover { background: rgba(17, 17, 20, 0.13); }
@media (prefers-color-scheme: dark) {
  .dialog { background: #212127; color: #f2f2f5; }
  .body, .dont-ask { color: #b4b4be; }
  button.secondary { background: rgba(255, 255, 255, 0.12); color: #f2f2f5; }
  button.secondary:hover { background: rgba(255, 255, 255, 0.2); }
}
`;

/**
 * 切り替え確認。window.confirm() を使わないのは、モーダルの表示中も transient
 * activation の 5 秒が進んでしまい、直後の requestWindow() が失敗しうるため。
 * ボタンのクリックがそのまま新しい activation になるこの形なら確実に開ける。
 */
function confirmSwitch(): Promise<{ confirmed: boolean; dontAskAgain: boolean }> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CONFIRM_CSS;

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';
    dialog.setAttribute('role', 'alertdialog');

    const title = document.createElement('h2');
    title.className = 'title';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = '!';
    mark.setAttribute('aria-hidden', 'true');
    const titleText = document.createElement('span');
    titleText.textContent = UI_TEXT.switchTitle;
    title.append(mark, titleText);

    const body = document.createElement('p');
    body.className = 'body';
    body.textContent = UI_TEXT.switchBody;

    const dontAsk = document.createElement('label');
    dontAsk.className = 'dont-ask';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const dontAskText = document.createElement('span');
    dontAskText.textContent = UI_TEXT.dontAskAgain;
    dontAsk.append(checkbox, dontAskText);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const spacer = document.createElement('div');
    spacer.className = 'spacer';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'secondary';
    cancel.textContent = UI_TEXT.cancelAction;

    const proceed = document.createElement('button');
    proceed.type = 'button';
    proceed.className = 'primary';
    proceed.textContent = UI_TEXT.switchAction;

    actions.append(spacer, cancel, proceed);
    dialog.append(title, body, dontAsk, actions);
    backdrop.append(dialog);
    shadow.append(style, backdrop);

    let settled = false;
    const finish = (confirmed: boolean): void => {
      if (settled) return;
      settled = true;
      window.removeEventListener('keydown', onKeyDown, true);
      host.remove();
      resolve({ confirmed, dontAskAgain: checkbox.checked });
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    };

    cancel.addEventListener('click', () => finish(false));
    proceed.addEventListener('click', () => finish(true));
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) finish(false);
    });
    window.addEventListener('keydown', onKeyDown, true);

    document.documentElement.append(host);
    proceed.focus();
  });
}

/** ヘルパーウィンドウ経由の PiP は別ウィンドウにあるので、service worker に聞く。 */
async function isPersistentPipOpen(): Promise<boolean> {
  try {
    const state = (await chrome.runtime.sendMessage({
      type: MessageType.QueryPersistentPip,
    })) as PersistentPipState | undefined;
    return state?.open === true;
  } catch (error) {
    console.warn('[ClipPiP] failed to query the persistent PiP', error);
    return false;
  }
}

async function closePersistentPip(): Promise<void> {
  try {
    await chrome.runtime.sendMessage({ type: MessageType.ClosePersistentPip });
  } catch (error) {
    console.warn('[ClipPiP] failed to close the persistent PiP', error);
  }
}

async function sendPersistentCommand(message: object): Promise<Ack> {
  const ack = (await chrome.runtime.sendMessage(message)) as Ack | undefined;
  return ack ?? { ok: false, error: 'no response from the extension' };
}

async function preparePersistentPip(): Promise<void> {
  const ack = await sendPersistentCommand({ type: MessageType.PreparePersistentPip });
  if (!ack.ok) throw new Error(ack.error ?? 'failed to prepare the helper window');
}

async function activatePersistentPip(activation: object): Promise<Ack> {
  return sendPersistentCommand({
    type: MessageType.ActivatePersistentPip,
    activation,
  });
}

async function renderPersistentPip(payload: PipPayload): Promise<Ack> {
  return sendPersistentCommand({
    type: MessageType.RenderPersistentPip,
    payload,
  });
}

async function showPersistentPipHelper(): Promise<void> {
  await chrome.runtime.sendMessage({ type: MessageType.ShowPersistentPipHelper });
}

/**
 * 既に PiP が開いていれば、切り替えてよいか確認する。
 * 選択やキャプチャに入る前に呼ぶこと。キャンセル時の手戻りを無くすため。
 *
 * ここで承諾された時点でヘルパー側の PiP は閉じてしまう。PiP を開く直前まで
 * 残すと、requestWindow() の直前に待ちが入って activation を失いやすいため。
 */
async function allowSwitch(): Promise<boolean> {
  const persistentOpen = await isPersistentPipOpen();

  if (pipManager.isOpen || persistentOpen) {
    if (await shouldConfirmSwitch()) {
      const { confirmed, dontAskAgain } = await confirmSwitch();
      if (!confirmed) return false;
      // 「次回から確認しない」は、切り替えを承諾した場合だけ保存する
      if (dontAskAgain) await setConfirmSwitch(false);
    }
  }

  if (persistentOpen) await closePersistentPip();
  return true;
}

/** 次の描画フレームを待つ。 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

async function requestCapture(): Promise<string> {
  const result = (await chrome.runtime.sendMessage({
    type: MessageType.CaptureVisibleTab,
  })) as CaptureResult | undefined;

  if (!result) {
    throw new Error('no response from the service worker');
  }
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.dataUrl;
}

/**
 * requestWindow() は transient activation を要求する。コンテキストメニュー経由など
 * ユーザー操作が引き継がれない場合は、トーストのボタンで操作を受け直して再試行する。
 * ユーザーが操作しなかった場合は null。
 */
let running = false;

async function runAreaPin(): Promise<void> {
  if (!isDocumentPipSupported()) {
    showToast(UI_TEXT.pipUnsupported);
    return;
  }

  if (!(await allowSwitch())) return;

  try {
    await preparePersistentPip();
  } catch (error) {
    console.error('[ClipPiP] failed to prepare the helper window', error);
    showToast(UI_TEXT.pipFailed);
    return;
  }

  const rect = await selectArea();
  if (!rect) {
    await closePersistentPip();
    return;
  }

  // pointerup の transient activation が残っている間に、待機中の helper へ渡す。
  const activation = await activatePersistentPip({ kind: 'area', rect });

  const viewport = { width: window.innerWidth, height: window.innerHeight };

  // オーバーレイ除去がスクリーンショットに反映されるまで 2 フレーム待つ
  await nextPaint();
  await nextPaint();

  let cropped: CroppedImage;
  try {
    const dataUrl = await requestCapture();
    cropped = await cropCapture(dataUrl, rect, viewport);
  } catch (error) {
    console.error('[ClipPiP] capture failed', error);
    await closePersistentPip();
    showToast(UI_TEXT.captureFailed);
    return;
  }

  pipManager.close();
  try {
    const imageDataUrl = await encodeImage(cropped);
    const rendered = await renderPersistentPip({ kind: 'area', imageDataUrl, rect });
    if (!activation.ok || !rendered.ok) await showPersistentPipHelper();
  } catch (error) {
    console.error('[ClipPiP] failed to hand the capture to the helper window', error);
    showToast(UI_TEXT.pipFailed);
  } finally {
    cropped.dispose();
  }
}

/** Live Pin。映像の供給源が元タブなので、閉じるとそこで止まる。 */
async function runLivePin(): Promise<void> {
  if (!isDocumentPipSupported()) {
    showToast(UI_TEXT.pipUnsupported);
    return;
  }

  if (!(await allowSwitch())) return;

  try {
    // ストリーム ID の consumer に指定するため、先にヘルパーを用意しておく
    await preparePersistentPip();
  } catch (error) {
    console.error('[ClipPiP] failed to prepare the helper window', error);
    showToast(UI_TEXT.pipFailed);
    return;
  }

  const rect = await selectArea();
  if (!rect) {
    await closePersistentPip();
    return;
  }

  const activation = await activatePersistentPip({ kind: 'live', rect });
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const dpr = window.devicePixelRatio || 1;

  pipManager.close();
  try {
    const rendered = await renderPersistentPip({ kind: 'live', rect, viewport, dpr });
    if (!rendered.ok) {
      await closePersistentPip();
      const retry = rendered.error === LIVE_RETRY_ERROR;
      showToast(retry ? UI_TEXT.liveRetryAfterGrant : UI_TEXT.liveCaptureFailed);
      return;
    }
    if (!activation.ok) await showPersistentPipHelper();
  } catch (error) {
    console.error('[ClipPiP] failed to hand the stream to the helper window', error);
    showToast(UI_TEXT.liveCaptureFailed);
  }
}

async function runTextPin(fallbackText: string): Promise<void> {
  if (!isDocumentPipSupported()) {
    showToast(UI_TEXT.pipUnsupported);
    return;
  }

  const text = getSelectedText(fallbackText);
  if (!text) {
    showToast(UI_TEXT.noSelection);
    return;
  }

  if (!(await allowSwitch())) return;

  pipManager.close();
  try {
    await preparePersistentPip();
    const activation = await activatePersistentPip({ kind: 'text' });
    const rendered = await renderPersistentPip({ kind: 'text', text });
    if (!activation.ok || !rendered.ok) await showPersistentPipHelper();
  } catch (error) {
    console.error('[ClipPiP] failed to hand the text to the helper window', error);
    showToast(UI_TEXT.pipFailed);
  }
}

async function handleMessage(message: ContentMessage): Promise<void> {
  if (running) {
    showToast(UI_TEXT.busy);
    return;
  }
  running = true;
  try {
    switch (message.type) {
      case MessageType.StartAreaPin:
        await runAreaPin();
        break;
      case MessageType.StartLivePin:
        await runLivePin();
        break;
      case MessageType.StartTextPin:
        await runTextPin(message.fallbackText);
        break;
    }
  } finally {
    running = false;
  }
}

const globalScope = globalThis as Record<string, unknown>;

if (!globalScope[LOADED_FLAG]) {
  globalScope[LOADED_FLAG] = true;

  const HANDLED: ReadonlySet<string> = new Set<string>([
    MessageType.StartAreaPin,
    MessageType.StartLivePin,
    MessageType.StartTextPin,
  ]);

  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    if (!HANDLED.has(message?.type)) {
      return false;
    }
    // popup は即座に閉じるため、処理を待たず受領だけ返す
    void handleMessage(message);
    sendResponse({ ok: true } satisfies Ack);
    return false;
  });
}
