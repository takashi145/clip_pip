import { PIP_SIZE } from '../shared/types';
import { createCloseButton, createElement, getPipTheme, pipManager } from './pip-manager';

export function textPipSize(): { width: number; height: number } {
  return { width: PIP_SIZE.textWidth, height: PIP_SIZE.textHeight };
}

export function renderTextPip(win: Window, text: string): void {
  const doc = win.document;
  const theme = getPipTheme(win);
  doc.body.replaceChildren();

  const scroller = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    overflowY: 'auto',
    overflowX: 'hidden',
    background: theme.background,
    // 右上の閉じるボタンと本文が重ならないように上側の余白を広く取る
    padding: '44px 18px 18px',
    boxSizing: 'border-box',
  });

  const body = createElement(doc, 'div', {
    margin: '0',
    color: theme.text,
    fontSize: '14px',
    lineHeight: '1.7',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    userSelect: 'text',
  });
  body.textContent = text;

  const closeButton = createCloseButton(doc, theme, () => pipManager.close());

  scroller.append(body);
  doc.body.append(scroller, closeButton);

  pipManager.registerCleanup(() => {
    body.textContent = '';
    doc.body.replaceChildren();
  });
}
