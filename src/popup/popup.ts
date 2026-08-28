/**
 * 拡張アイコンのクリックで activeTab 権限が付与されるため、
 * content script はここで初めて注入する。常時の host permission は不要。
 */
import { describeFailure, preflightError } from '../shared/failure';
import { localizeDocument } from '../shared/localize';
import { setConfirmSwitch, shouldConfirmSwitch } from '../shared/settings';
import type { ContentMessage } from '../shared/types';
import { MessageType, UI_TEXT } from '../shared/types';

localizeDocument();

const areaButton = document.getElementById('area-pin') as HTMLButtonElement | null;
const liveButton = document.getElementById('live-pin') as HTMLButtonElement | null;
const errorBox = document.getElementById('error') as HTMLParagraphElement | null;
const confirmSwitchBox = document.getElementById('confirm-switch') as HTMLInputElement | null;

function showError(message: string): void {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError(): void {
  if (!errorBox) return;
  errorBox.textContent = '';
  errorBox.hidden = true;
}

async function start(message: ContentMessage): Promise<void> {
  clearError();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    showError(UI_TEXT.noActiveTab);
    return;
  }

  const url = tab.url ?? tab.pendingUrl ?? '';
  const preflight = preflightError(url);
  if (preflight) {
    showError(preflight);
    return;
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tab.id, message);
  } catch (error) {
    console.error('[ClipPiP] failed to start', { url, error });
    showError(describeFailure(error, url));
    return;
  }

  window.close();
}

function bindStart(button: HTMLButtonElement | null, message: ContentMessage): void {
  button?.addEventListener('click', () => {
    button.disabled = true;
    void start(message).finally(() => {
      button.disabled = false;
    });
  });
}

bindStart(areaButton, { type: MessageType.StartAreaPin });
bindStart(liveButton, { type: MessageType.StartLivePin });

function bindToggle(
  box: HTMLInputElement | null,
  read: () => Promise<boolean>,
  write: (value: boolean) => Promise<void>,
): void {
  if (!box) return;
  void read().then((value) => {
    box.checked = value;
  });
  box.addEventListener('change', () => {
    void write(box.checked);
  });
}

bindToggle(confirmSwitchBox, shouldConfirmSwitch, setConfirmSwitch);
