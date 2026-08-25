/**
 * 拡張機能の設定。chrome.storage.local に保存する。
 * storage 権限はインストール時の警告文言を増やさないため、最小権限の方針とは両立する。
 */
const CONFIRM_SWITCH_KEY = 'confirmPipSwitch';

/** PiP を切り替える前に確認するか。既定は確認する。 */
export async function shouldConfirmSwitch(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(CONFIRM_SWITCH_KEY);
    return stored[CONFIRM_SWITCH_KEY] !== false;
  } catch (error) {
    console.warn('[ClipPiP] failed to read the setting', error);
    return true;
  }
}

export async function setConfirmSwitch(value: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [CONFIRM_SWITCH_KEY]: value });
  } catch (error) {
    console.warn('[ClipPiP] failed to save the setting', error);
  }
}
