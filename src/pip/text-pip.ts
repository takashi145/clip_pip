import { PIP_SIZE } from '../shared/types';
import type { PipControl } from './pip-manager';
import { createElement, createPipControls, getPipTheme, pipManager } from './pip-manager';

export function textPipSize(): { width: number; height: number } {
  return { width: PIP_SIZE.textWidth, height: PIP_SIZE.textHeight };
}

export function renderTextPip(win: Window, text: string, controls: PipControl[] = []): void {
  const doc = win.document;
  const theme = getPipTheme(win);
  doc.body.replaceChildren();

  const scroller = createElement(doc, 'div', {
    position: 'absolute',
    inset: '0',
    overflowY: 'auto',
    overflowX: 'hidden',
    background: theme.background,
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

  scroller.append(body);
  doc.body.append(scroller);
  if (controls.length > 0) doc.body.append(createPipControls(doc, theme, controls));

  pipManager.registerCleanup(() => {
    body.textContent = '';
    doc.body.replaceChildren();
  });
}
