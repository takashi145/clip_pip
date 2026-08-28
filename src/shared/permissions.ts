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

/** 既に許可済みなら確認画面を出さずに true を返す。ユーザー操作の直後に呼ぶこと。 */
export async function requestTabCapture(): Promise<boolean> {
  try {
    return await chrome.permissions.request(tabCapture());
  } catch (error) {
    console.warn('[ClipPiP] failed to request the tabCapture permission', error);
    return false;
  }
}
