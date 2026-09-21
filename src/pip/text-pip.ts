import { buildTextFragmentUrl } from '../shared/text-fragment';
import type { TextPipEntry } from '../shared/types';
import { PIP_SIZE } from '../shared/types';
import type { PipControl } from './pip-manager';
import { createElement, createPipControls, getPipTheme, pipManager } from './pip-manager';

export function textPipSize(): { width: number; height: number } {
  return { width: PIP_SIZE.textWidth, height: PIP_SIZE.textHeight };
}

export function renderTextPip(win: Window, entries: TextPipEntry[], controls: PipControl[] = []): void {
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

  const list = createElement(doc, 'div', { margin: '0' });

  entries.forEach((entry, index) => {
    const heading = createElement(doc, 'a', {
      display: 'block',
      margin: index === 0 ? '0 0 4px' : '16px 0 4px',
      color: theme.subtleText,
      fontSize: '12px',
      fontWeight: '600',
      textDecoration: 'none',
      overflowWrap: 'anywhere',
    });
    heading.href = buildTextFragmentUrl(entry.url, entry.text);
    heading.target = '_blank';
    heading.rel = 'noopener noreferrer';
    heading.textContent = entry.title || entry.url;
    heading.addEventListener('mouseenter', () => heading.style.setProperty('text-decoration', 'underline'));
    heading.addEventListener('mouseleave', () => heading.style.setProperty('text-decoration', 'none'));
    list.append(heading);

    const body = createElement(doc, 'div', {
      margin: '0 0 10px',
      color: theme.text,
      fontSize: '14px',
      lineHeight: '1.7',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      overflowWrap: 'anywhere',
      userSelect: 'text',
    });
    body.textContent = entry.text;
    list.append(body);
  });

  scroller.append(list);
  doc.body.append(scroller);
  if (controls.length > 0) doc.body.append(createPipControls(doc, theme, controls));

  pipManager.registerCleanup(() => {
    list.replaceChildren();
    doc.body.replaceChildren();
  });
}
