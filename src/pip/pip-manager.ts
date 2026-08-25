/**
 * PiP ウィンドウの document は生成元ページの CSP を引き継ぎ、<style> や
 * style 属性が拒否されうる。そのためこの配下のスタイルはすべて CSSOM で当てる。
 *
 * 同時に開ける PiP は 1 つ。新しく開くときは既存を閉じる。
 */
import { UI_TEXT } from '../shared/types';

export interface PipOptions {
  width: number;
  height: number;
}

export interface PipTheme {
  background: string;
  surface: string;
  text: string;
  subtleText: string;
  border: string;
}

const DARK_THEME: PipTheme = {
  background: '#16161a',
  surface: 'rgba(255, 255, 255, 0.12)',
  text: '#f2f2f5',
  subtleText: '#a8a8b3',
  border: 'rgba(255, 255, 255, 0.16)',
};

const LIGHT_THEME: PipTheme = {
  background: '#fbfbfd',
  surface: 'rgba(17, 17, 20, 0.08)',
  text: '#1a1a1f',
  subtleText: '#5c5c68',
  border: 'rgba(17, 17, 20, 0.12)',
};

const FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", Meiryo, sans-serif';

export function isDocumentPipSupported(): boolean {
  return typeof window.documentPictureInPicture?.requestWindow === 'function';
}

/** CSSOM 経由でのスタイル適用。CSP の style-src に阻まれない。 */
function applyStyle(element: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    element.style.setProperty(hyphenate(property), value);
  }
}

function hyphenate(property: string): string {
  return property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

export function createElement<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  styles: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const element = doc.createElement(tag);
  applyStyle(element, styles);
  return element;
}

export function getPipTheme(win: Window): PipTheme {
  try {
    return win.matchMedia('(prefers-color-scheme: dark)').matches ? DARK_THEME : LIGHT_THEME;
  } catch {
    return DARK_THEME;
  }
}

export function createCloseButton(doc: Document, theme: PipTheme, onClose: () => void): HTMLButtonElement {
  const button = createElement(doc, 'button', {
    position: 'absolute',
    top: '8px',
    right: '8px',
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0',
    border: `1px solid ${theme.border}`,
    borderRadius: '50%',
    background: theme.surface,
    color: theme.text,
    font: `600 15px/1 ${FONT_STACK}`,
    cursor: 'pointer',
    zIndex: '10',
    transition: 'opacity 120ms ease',
    opacity: '0.72',
  });
  button.type = 'button';
  button.textContent = '×';
  button.title = UI_TEXT.closeButton;
  button.setAttribute('aria-label', UI_TEXT.closeButton);
  button.addEventListener('mouseenter', () => button.style.setProperty('opacity', '1'));
  button.addEventListener('mouseleave', () => button.style.setProperty('opacity', '0.72'));
  button.addEventListener('click', onClose);
  return button;
}

class PipManager {
  private win: Window | null = null;
  private cleanups: Array<() => void> = [];

  get isOpen(): boolean {
    return this.win !== null && !this.win.closed;
  }

  /** requestWindow() は transient activation を要求するため、ユーザー操作の直後に呼ぶこと。 */
  async open(options: PipOptions): Promise<Window> {
    const api = window.documentPictureInPicture;
    if (!api) {
      throw new Error(UI_TEXT.pipUnsupported);
    }

    this.close();

    const win = await api.requestWindow({
      width: Math.round(options.width),
      height: Math.round(options.height),
    });

    this.win = win;
    this.cleanups = [];

    applyStyle(win.document.documentElement, { height: '100%' });
    applyStyle(win.document.body, {
      margin: '0',
      padding: '0',
      height: '100%',
      overflow: 'hidden',
      font: `400 14px/1.6 ${FONT_STACK}`,
    });

    // ブラウザ標準の PiP 終了操作でも後始末が走るようにする
    win.addEventListener('pagehide', () => this.handleClosed(), { once: true });
    win.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') this.close();
    });

    return win;
  }

  /** PiP 終了時に実行する後始末を登録する。 */
  registerCleanup(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  close(): void {
    const win = this.win;
    this.handleClosed();
    if (win && !win.closed) {
      win.close();
    }
  }

  private handleClosed(): void {
    const cleanups = this.cleanups;
    this.cleanups = [];
    this.win = null;
    for (const cleanup of cleanups) {
      try {
        cleanup();
      } catch (error) {
        console.warn('[ClipPiP] cleanup failed', error);
      }
    }
  }
}

export const pipManager = new PipManager();
