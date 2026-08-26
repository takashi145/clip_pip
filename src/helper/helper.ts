/**
 * 元タブの代わりに Document PiP の opener を務める拡張機能ページ。
 * 選択操作より先に最小化状態で待機し、実ユーザー操作付きの拡張メッセージを
 * 受け取った瞬間に空の PiP を確保する。
 */
import { decodeImage } from '../capture/capture';
import type { CroppedImage } from '../capture/capture';
import { areaPipSize, renderAreaPip } from '../pip/area-pip';
import { pipManager } from '../pip/pip-manager';
import { renderTextPip, textPipSize } from '../pip/text-pip';
import { localizeDocument } from '../shared/localize';
import type { Ack, PipActivation, PipPayload } from '../shared/types';
import { MessageType, SESSION_KEY, UI_TEXT } from '../shared/types';

localizeDocument();

const button = document.getElementById('open-pip') as HTMLButtonElement | null;
const statusBox = document.getElementById('status') as HTMLParagraphElement | null;

let pendingPayload: PipPayload | null = null;
let pendingImage: CroppedImage | null = null;
let activationFailed = false;
let opening = false;

function showStatus(message: string): void {
  if (!statusBox) return;
  statusBox.textContent = message;
  statusBox.hidden = false;
}

function closeSelf(): void {
  void chrome.runtime.sendMessage({ type: MessageType.ClosePersistentPip }).catch(() => undefined);
}

function renderPayload(win: Window, payload: PipPayload, image: CroppedImage | null): void {
  if (payload.kind === 'area') {
    if (!image) throw new Error('the image is not available');
    pendingImage = null;
    renderAreaPip(win, image);
  } else {
    renderTextPip(win, payload.text);
  }
}

function showFallback(): void {
  if (!pendingPayload || !button) return;
  showStatus(UI_TEXT.activationPrompt);
  button.hidden = false;
  button.disabled = false;
  button.focus();
}

/** メッセージイベントから同期的に requestWindow() まで到達させる。 */
function activatePip(activation: PipActivation, sendResponse: (response: Ack) => void): void {
  if (opening || pipManager.isOpen) {
    sendResponse({ ok: true });
    return;
  }
  opening = true;

  const size = activation.kind === 'area' ? areaPipSize(activation.rect) : textPipSize();
  pipManager
    .open(size)
    .then(() => {
      opening = false;
      activationFailed = false;
      pipManager.registerCleanup(closeSelf);
      sendResponse({ ok: true });
    })
    .catch((error: unknown) => {
      console.warn('[ClipPiP] automatic PiP activation failed', error);
      opening = false;
      activationFailed = true;
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
}

async function receivePayload(payload: PipPayload): Promise<Ack> {
  pendingPayload = payload;
  await chrome.storage.session.set({ [SESSION_KEY.payload]: payload });

  if (payload.kind === 'area') {
    try {
      pendingImage = await decodeImage(payload.imageDataUrl);
    } catch (error) {
      console.error('[ClipPiP] failed to decode the capture', error);
      showStatus(UI_TEXT.captureFailed);
      return { ok: false, error: 'failed to decode the capture' };
    }
  }

  const win = pipManager.current;
  if (win) {
    try {
      renderPayload(win, payload, pendingImage);
      return { ok: true };
    } catch (error) {
      console.error('[ClipPiP] failed to render the PiP', error);
      pipManager.close();
    }
  }

  activationFailed = true;
  showFallback();
  return { ok: false, error: 'PiP activation is required' };
}

button?.addEventListener('click', () => {
  if (!pendingPayload || opening) return;
  opening = true;
  button.disabled = true;
  const payload = pendingPayload;
  const image = pendingImage;
  const size = payload.kind === 'area' ? areaPipSize(payload.rect) : textPipSize();

  pipManager
    .open(size)
    .then((win) => {
      renderPayload(win, payload, image);
      pipManager.registerCleanup(closeSelf);
      opening = false;
      return chrome.runtime.sendMessage({ type: MessageType.PersistentPipOpened });
    })
    .catch((error: unknown) => {
      console.error('[ClipPiP] failed to open the PiP window', error);
      opening = false;
      button.disabled = false;
      showStatus(UI_TEXT.pipFailed);
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MessageType.ActivatePersistentPip) {
    activatePip(message.activation as PipActivation, sendResponse);
    return true;
  }
  if (message?.type === MessageType.RenderPersistentPip) {
    void receivePayload(message.payload as PipPayload).then(sendResponse);
    return true;
  }
  return false;
});

// 保存済み内容があれば手動フォールバック可能にする。
void chrome.storage.session.get(SESSION_KEY.payload).then((stored) => {
  const payload = stored[SESSION_KEY.payload] as PipPayload | undefined;
  if (!payload || pendingPayload) return;
  activationFailed = true;
  void receivePayload(payload).then(() => {
    if (activationFailed) showFallback();
  });
});
