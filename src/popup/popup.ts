/**
 * 拡張アイコンのクリックで activeTab 権限が付与されるため、
 * content script はここで初めて注入する。常時の host permission は不要。
 */
import { describeFailure, preflightError } from '../shared/failure';
import { localizeDocument } from '../shared/localize';
import { setConfirmSwitch, shouldConfirmSwitch } from '../shared/settings';
import type { StartAreaPinMessage } from '../shared/types';
import { MessageType, UI_TEXT } from '../shared/types';

localizeDocument();

const button = document.getElementById('area-pin') as HTMLButtonElement | null;
const errorBox = document.getElementById('error') as HTMLParagraphElement | null;
const confirmSwitchBox = document.getElementById('confirm-switch') as HTMLInputElement | null;
const shortcutsButton = document.getElementById('open-shortcuts') as HTMLButtonElement | null;

const SHORTCUTS_URL = 'chrome://extensions/shortcuts';

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

async function startAreaPin(): Promise<void> {
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
    await chrome.tabs.sendMessage(tab.id, {
      type: MessageType.StartAreaPin,
    } satisfies StartAreaPinMessage);
  } catch (error) {
    console.error('[ClipPiP] failed to start Area Pin', { url, error });
    showError(describeFailure(error, url));
    return;
  }

  window.close();
}

button?.addEventListener('click', () => {
  if (!button) return;
  button.disabled = true;
  void startAreaPin().finally(() => {
    button.disabled = false;
  });
});

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

shortcutsButton?.addEventListener('click', () => {
  chrome.tabs
    .create({ url: SHORTCUTS_URL })
    .then(() => window.close())
    // 開けなかった場合も案内文に URL が載っているので、ここでは黙って諦める
    .catch((error: unknown) => console.warn('[ClipPiP] failed to open the shortcuts page', error));
});
