/**
 * PiP の元になったタブへの参照。service worker とヘルパーの両方から使う。
 *
 * chrome.tabs.get / update は "tabs" 権限が無くても呼べる（url や title が
 * 落ちるだけで、ここでは使わない）ため、権限を増やさずに済む。
 */
import { SESSION_KEY } from './types';

export async function getSourceTabId(): Promise<number | null> {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY.sourceTabId);
    const id = stored[SESSION_KEY.sourceTabId];
    return typeof id === 'number' ? id : null;
  } catch (error) {
    console.warn('[ClipPiP] failed to read the source tab id', error);
    return null;
  }
}

/** 元タブがまだ存在するか。閉じられていれば false。 */
export async function isSourceTabAlive(): Promise<boolean> {
  const id = await getSourceTabId();
  if (id === null) return false;
  try {
    await chrome.tabs.get(id);
    return true;
  } catch {
    return false;
  }
}

/** 元タブをアクティブにする。既に閉じられていれば false。 */
export async function focusSourceTab(): Promise<boolean> {
  const id = await getSourceTabId();
  if (id === null) return false;

  try {
    const tab = await chrome.tabs.update(id, { active: true });
    if (tab?.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return true;
  } catch (error) {
    console.warn('[ClipPiP] failed to focus the source tab', error);
    return false;
  }
}
