/**
 * tabCapture は optional_permissions に置いてある。常時持っているとインストール時に
 * 「すべてのウェブサイトのデータの読み取りと変更」が出て、Live Pin を使わない人にも負担になる。
 */
function tabCapture(): chrome.permissions.Permissions {
  return { permissions: ['tabCapture'] };
}

export async function hasTabCapture(): Promise<boolean> {
  try {
    return await chrome.permissions.contains(tabCapture());
  } catch (error) {
    console.warn('[ClipPiP] failed to check the tabCapture permission', error);
    return false;
  }
}

/** permissions.request() は拡張機能のページからしか呼べないので、小窓を開いて受ける。 */
export async function openPermissionWindow(): Promise<boolean> {
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('permission.html'),
      type: 'popup',
      width: 420,
      height: 300,
    });
    return true;
  } catch (error) {
    console.warn('[ClipPiP] failed to open the permission window', error);
    return false;
  }
}

/** 既に許可済みなら確認画面を出さずに true を返す。ユーザー操作の直後に呼ぶこと。 */
export async function requestTabCapture(): Promise<boolean> {
  try {
    return await chrome.permissions.request(tabCapture());
  } catch (error) {
    console.warn('[ClipPiP] failed to request the tabCapture permission', error);
    return false;
  }
}
