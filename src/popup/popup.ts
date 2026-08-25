/**
 * 拡張アイコンのクリックで activeTab 権限が付与されるため、
 * content script はここで初めて注入する。常時の host permission は不要。
 */
import { describeFailure, preflightError } from '../shared/failure';
import { setConfirmSwitch, shouldConfirmSwitch } from '../shared/settings';
import type { StartAreaPinMessage } from '../shared/types';
import { MessageType, UI_TEXT } from '../shared/types';

/**
 * chrome.i18n は HTML のテキストノードを自動翻訳しないため、data-i18n /
 * data-i18n-lines を振った要素へ起動時に流し込む。lines 版は改行を <br> に
 * 変換する（textContent だと改行がそのまま潰れて表示されるため）。
 */
function localizeDocument(): void {
  document.documentElement.lang = chrome.i18n.getUILanguage();

  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (!key) continue;
    element.textContent = chrome.i18n.getMessage(key);
  }

  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n-lines]')) {
    const key = element.dataset.i18nLines;
    if (!key) continue;
    const lines = chrome.i18n.getMessage(key).split('\n');
    element.replaceChildren();
    lines.forEach((line, index) => {
      if (index > 0) element.append(document.createElement('br'));
      element.append(document.createTextNode(line));
    });
  }
}

localizeDocument();

const button = document.getElementById('area-pin') as HTMLButtonElement | null;
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

if (confirmSwitchBox) {
  void shouldConfirmSwitch().then((value) => {
    confirmSwitchBox.checked = value;
  });
  confirmSwitchBox.addEventListener('change', () => {
    void setConfirmSwitch(confirmSwitchBox.checked);
  });
}
