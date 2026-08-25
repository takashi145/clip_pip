/** viewport 座標系（CSS ピクセル）の矩形。 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** viewport サイズ（CSS ピクセル）。 */
export interface Viewport {
  width: number;
  height: number;
}

export const MessageType = {
  /** popup -> content script: Area Pin モードを開始する */
  StartAreaPin: 'clippip/start-area-pin',
  /** service worker -> content script: Text Pin を実行する */
  StartTextPin: 'clippip/start-text-pin',
  /** content script -> service worker: 可視タブのキャプチャを要求する */
  CaptureVisibleTab: 'clippip/capture-visible-tab',
} as const;

export interface StartAreaPinMessage {
  type: typeof MessageType.StartAreaPin;
}

export interface StartTextPinMessage {
  type: typeof MessageType.StartTextPin;
  /** window.getSelection() で取れなかった場合に使う。 */
  fallbackText: string;
}

export type ContentMessage = StartAreaPinMessage | StartTextPinMessage;

export interface CaptureVisibleTabMessage {
  type: typeof MessageType.CaptureVisibleTab;
}

export type CaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export interface Ack {
  ok: boolean;
  error?: string;
}

/** PiP ウィンドウの初期サイズの目安。 */
export const PIP_SIZE = {
  areaWidth: 480,
  textWidth: 400,
  textHeight: 250,
  minWidth: 220,
  minHeight: 140,
} as const;

/**
 * chrome.i18n.getMessage() は毎回呼び出すコストが無視できるほど軽いため、
 * getter で包んで従来どおり UI_TEXT.xxx という参照のまま呼び出し側を変えずに済ませる。
 * 実体は public/_locales/{ja,en}/messages.json。
 */
export const UI_TEXT = {
  get pipUnsupported(): string {
    return chrome.i18n.getMessage('pipUnsupported');
  },
  get captureFailed(): string {
    return chrome.i18n.getMessage('captureFailed');
  },
  get pipFailed(): string {
    return chrome.i18n.getMessage('pipFailed');
  },
  get restrictedPage(): string {
    return chrome.i18n.getMessage('restrictedPage');
  },
  get pdfNotSupported(): string {
    return chrome.i18n.getMessage('pdfNotSupported');
  },
  get fileAccessRequired(): string {
    return chrome.i18n.getMessage('fileAccessRequired');
  },
  get reloadRequired(): string {
    return chrome.i18n.getMessage('reloadRequired');
  },
  get noActiveTab(): string {
    return chrome.i18n.getMessage('noActiveTab');
  },
  get noSelection(): string {
    return chrome.i18n.getMessage('noSelection');
  },
  get busy(): string {
    return chrome.i18n.getMessage('busy');
  },
  get startFailed(): string {
    return chrome.i18n.getMessage('startFailed');
  },
  get selectHint(): string {
    return chrome.i18n.getMessage('selectHint');
  },
  get activationPrompt(): string {
    return chrome.i18n.getMessage('activationPrompt');
  },
  get activationAction(): string {
    return chrome.i18n.getMessage('activationAction');
  },
  get switchTitle(): string {
    return chrome.i18n.getMessage('switchTitle');
  },
  get switchBody(): string {
    return chrome.i18n.getMessage('switchBody');
  },
  get switchAction(): string {
    return chrome.i18n.getMessage('switchAction');
  },
  get cancelAction(): string {
    return chrome.i18n.getMessage('cancelAction');
  },
  get dontAskAgain(): string {
    return chrome.i18n.getMessage('dontAskAgain');
  },
  get confirmSwitchLabel(): string {
    return chrome.i18n.getMessage('confirmSwitchLabel');
  },
  get closeButton(): string {
    return chrome.i18n.getMessage('closeButton');
  },
  get contextMenuAreaPin(): string {
    return chrome.i18n.getMessage('contextMenuAreaPin');
  },
  get contextMenuTextPin(): string {
    return chrome.i18n.getMessage('contextMenuTextPin');
  },
  get badgeDefaultTitle(): string {
    return chrome.i18n.getMessage('badgeDefaultTitle');
  },
} as const;

/** service worker のバッジタイトル用。プレースホルダー付きメッセージは getMessage の第 2 引数で組み立てる。 */
export function formatBadgeErrorTitle(message: string): string {
  return chrome.i18n.getMessage('badgeErrorTitle', [message]);
}

declare global {
  interface DocumentPictureInPictureOptions {
    width?: number;
    height?: number;
    disallowReturnToOpener?: boolean;
    preferInitialWindowPlacement?: boolean;
  }

  interface DocumentPictureInPicture extends EventTarget {
    readonly window: Window | null;
    requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  }

  interface Window {
    readonly documentPictureInPicture?: DocumentPictureInPicture;
  }
}
