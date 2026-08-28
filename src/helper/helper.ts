/**
 * 元タブの代わりに Document PiP の opener を務める拡張機能ページ。
 * 選択操作より先に最小化状態で待機し、実ユーザー操作付きの拡張メッセージを
 * 受け取った瞬間に空の PiP を確保する。
 */
import { decodeImage } from '../capture/capture';
import type { CroppedImage } from '../capture/capture';
import { areaPipSize, renderAreaPip } from '../pip/area-pip';
import { renderLivePip } from '../pip/live-pip';
import type { PipControl } from '../pip/pip-manager';
import { pipManager } from '../pip/pip-manager';
import { renderTextPip, textPipSize } from '../pip/text-pip';
import { localizeDocument } from '../shared/localize';
import { focusSourceTab, getSourceTabId, isSourceTabAlive } from '../shared/source-tab';
import type { Ack, LivePipPayload, PipActivation, PipPayload } from '../shared/types';
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

/**
 * 「元のタブへ」ボタン。この PiP の opener はヘルパー自身なので、Chrome 標準の
 * 「タブに戻る」は無効化してある（pip-manager）。代わりにキャプチャ元のタブへ
 * 移動する手段をここで用意する。元タブが既に閉じられている場合は出さない。
 */
const RETURN_CONTROL_ID = 'return-to-source';

let sourceTabId: number | null = null;

function removeReturnButton(): void {
  const win = pipManager.current;
  win?.document.querySelector(`[data-clippip-control="${RETURN_CONTROL_ID}"]`)?.remove();
}

async function sourceTabControls(): Promise<PipControl[]> {
  sourceTabId = await getSourceTabId();
  if (sourceTabId === null || !(await isSourceTabAlive())) return [];

  return [
    {
      id: RETURN_CONTROL_ID,
      glyph: '↩',
      label: UI_TEXT.returnToTab,
      onClick: () => {
        // 押されるまでの間に閉じられていたら、ボタンごと引っ込める
        void focusSourceTab().then((moved) => {
          if (!moved) removeReturnButton();
        });
      },
    },
  ];
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (sourceTabId === null || tabId !== sourceTabId) return;
  sourceTabId = null;
  removeReturnButton();
});

/** ID の consumer はこのタブに固定されているので、映像に変換できるのはここだけ。 */
async function openTabStream(payload: LivePipPayload): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: payload.streamId,
      },
    },
  } as MediaStreamConstraints);
}

async function renderPayload(
  win: Window,
  payload: PipPayload,
  image: CroppedImage | null,
): Promise<void> {
  const controls = await sourceTabControls();

  if (payload.kind === 'area') {
    if (!image) throw new Error('the image is not available');
    pendingImage = null;
    renderAreaPip(win, image, controls);
    return;
  }

  if (payload.kind === 'live') {
    const stream = await openTabStream(payload);
    renderLivePip(win, stream, { rect: payload.rect, viewport: payload.viewport, controls });
    return;
  }

  renderTextPip(win, payload.text, controls);
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

  const size = activation.kind === 'text' ? textPipSize() : areaPipSize(activation.rect);
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
  // ストリーム ID は一度きりなので保存しない。復元しても映像には変換できない。
  if (payload.kind !== 'live') {
    await chrome.storage.session.set({ [SESSION_KEY.payload]: payload });
  }

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
      await renderPayload(win, payload, pendingImage);
      return { ok: true };
    } catch (error) {
      console.error('[ClipPiP] failed to render the PiP', error);
      pipManager.close();
      if (payload.kind === 'live') {
        showStatus(UI_TEXT.liveCaptureFailed);
        return { ok: false, error: 'failed to open the tab stream' };
      }
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
  const size = payload.kind === 'text' ? textPipSize() : areaPipSize(payload.rect);

  pipManager
    .open(size)
    .then(async (win) => {
      await renderPayload(win, payload, image);
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
