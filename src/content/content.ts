/**
 * 必要なときだけ注入されるため、同じタブへ複数回注入されうる。
 * リスナーの重複登録をグローバルフラグで防ぐ。
 */
import { cropCapture } from '../capture/capture';
import type { CroppedImage } from '../capture/capture';
import { areaPipSize, renderAreaPip } from '../pip/area-pip';
import type { PipOptions } from '../pip/pip-manager';
import { isDocumentPipSupported, pipManager } from '../pip/pip-manager';
import { renderTextPip, textPipSize } from '../pip/text-pip';
import type { Ack, CaptureResult, ContentMessage } from '../shared/types';
import { MessageType, UI_TEXT } from '../shared/types';
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

function showToast(message: string, options: { action?: ToastAction; timeoutMs?: number } = {}): ToastHandle {
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

  shadow.append(style, toast);
  document.documentElement.append(host);

  const timeoutMs = options.timeoutMs ?? 4000;
  if (timeoutMs > 0) {
    timer = window.setTimeout(dismiss, timeoutMs);
  }

  return { dismiss };
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
async function openPipWithActivationFallback(options: PipOptions): Promise<Window | null> {
  try {
    return await pipManager.open(options);
  } catch (error) {
    console.warn('[ClipPiP] requestWindow failed, asking for a user gesture', error);
  }

  const granted = await new Promise<boolean>((resolve) => {
    const toast = showToast(UI_TEXT.activationPrompt, {
      timeoutMs: 15000,
      action: {
        label: UI_TEXT.activationAction,
        onClick: () => {
          toast.dismiss();
          resolve(true);
        },
      },
    });
    window.setTimeout(() => resolve(false), 15000);
  });

  if (!granted) return null;

  try {
    // クリックハンドラ直後のマイクロタスクなので activation は有効
    return await pipManager.open(options);
  } catch (error) {
    console.error('[ClipPiP] failed to open the PiP window', error);
    showToast(UI_TEXT.pipFailed);
    return null;
  }
}

let running = false;

async function runAreaPin(): Promise<void> {
  if (!isDocumentPipSupported()) {
    showToast(UI_TEXT.pipUnsupported);
    return;
  }

  const rect = await selectArea();
  if (!rect) return;

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
    showToast(UI_TEXT.captureFailed);
    return;
  }

  const win = await openPipWithActivationFallback(areaPipSize(rect));
  if (!win) {
    cropped.dispose();
    return;
  }

  try {
    renderAreaPip(win, cropped);
  } catch (error) {
    console.error('[ClipPiP] failed to render the Area PiP', error);
    pipManager.close();
    cropped.dispose();
    showToast(UI_TEXT.pipFailed);
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

  const win = await openPipWithActivationFallback(textPipSize());
  if (!win) return;

  try {
    renderTextPip(win, text);
  } catch (error) {
    console.error('[ClipPiP] failed to render the Text PiP', error);
    pipManager.close();
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

  chrome.runtime.onMessage.addListener((message: ContentMessage, _sender, sendResponse) => {
    if (message?.type !== MessageType.StartAreaPin && message?.type !== MessageType.StartTextPin) {
      return false;
    }
    // popup は即座に閉じるため、処理を待たず受領だけ返す
    void handleMessage(message);
    sendResponse({ ok: true } satisfies Ack);
    return false;
  });
}
