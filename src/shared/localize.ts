/**
 * chrome.i18n は HTML のテキストノードを自動翻訳しないため、data-i18n /
 * data-i18n-lines を振った要素へ起動時に流し込む。lines 版は改行を <br> に
 * 変換する（textContent だと改行がそのまま潰れて表示されるため）。
 */
export function localizeDocument(): void {
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
