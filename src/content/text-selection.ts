/**
 * 現在の選択テキストを返す。選択が無ければ空文字。
 *
 * contextMenus API の selectionText は改行が失われることがあるため、
 * window.getSelection() を優先し、取れなかった場合だけ fallback を使う。
 */
export function getSelectedText(fallback = ''): string {
  const selection = window.getSelection();
  const fromDom = selection ? selection.toString() : '';
  const text = fromDom.trim().length > 0 ? fromDom : fallback;
  // 行頭・行末の空行だけ落とし、本文中の改行と字下げは維持する
  return text.replace(/^\s*\n/, '').replace(/\s+$/, '');
}
