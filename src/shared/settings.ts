/**
 * 拡張機能の設定。chrome.storage.local に保存する。
 * storage 権限はインストール時の警告文言を増やさないため、最小権限の方針とは両立する。
 */
const CONFIRM_SWITCH_KEY = 'confirmPipSwitch';

async function readFlag(key: string, fallback: boolean): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(key);
    const value = stored[key];
    return typeof value === 'boolean' ? value : fallback;
  } catch (error) {
    console.warn('[ClipPiP] failed to read the setting', error);
    return fallback;
  }
}

async function writeFlag(key: string, value: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [key]: value });
  } catch (error) {
    console.warn('[ClipPiP] failed to save the setting', error);
  }
}

/**
 * PiP を切り替える前に確認するか。既定は確認しない。
 * 同時に開ける PiP は 1 つで、切り替えは繰り返す操作なので、毎回止められると煩わしい。
 */
export function shouldConfirmSwitch(): Promise<boolean> {
  return readFlag(CONFIRM_SWITCH_KEY, false);
}

export function setConfirmSwitch(value: boolean): Promise<void> {
  return writeFlag(CONFIRM_SWITCH_KEY, value);
}
