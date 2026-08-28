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
  /** popup / service worker -> content script: Live Pin モードを開始する */
  StartLivePin: 'clippip/start-live-pin',
  /** service worker -> content script: Text Pin を実行する */
  StartTextPin: 'clippip/start-text-pin',
  /** content script -> service worker: 可視タブのキャプチャを要求する */
  CaptureVisibleTab: 'clippip/capture-visible-tab',
  /** content script -> service worker: 元タブの映像ストリーム ID を要求する */
  RequestTabStream: 'clippip/request-tab-stream',
  /** content script -> service worker: 最小化したヘルパーを先に待機させる */
  PreparePersistentPip: 'clippip/prepare-persistent-pip',
  /** content script -> helper: 現在のユーザー操作で空の PiP を確保する */
  ActivatePersistentPip: 'clippip/activate-persistent-pip',
  /** content script -> helper: 確保済みの PiP へ内容を描画する */
  RenderPersistentPip: 'clippip/render-persistent-pip',
  /** content script -> service worker: 自動開始失敗時にヘルパーを表示する */
  ShowPersistentPipHelper: 'clippip/show-persistent-pip-helper',
  /** content script -> service worker: ヘルパーウィンドウ経由で PiP を開く */
  OpenPersistentPip: 'clippip/open-persistent-pip',
  /** content script -> service worker: ヘルパー経由の PiP が表示中か問い合わせる */
  QueryPersistentPip: 'clippip/query-persistent-pip',
  /** content script / helper -> service worker: ヘルパーウィンドウを閉じる */
  ClosePersistentPip: 'clippip/close-persistent-pip',
  /** helper -> service worker: PiP を開いたのでヘルパーを最小化する */
  PersistentPipOpened: 'clippip/persistent-pip-opened',
} as const;

export interface StartAreaPinMessage {
  type: typeof MessageType.StartAreaPin;
}

export interface StartTextPinMessage {
  type: typeof MessageType.StartTextPin;
  /** window.getSelection() で取れなかった場合に使う。 */
  fallbackText: string;
}

export interface StartLivePinMessage {
  type: typeof MessageType.StartLivePin;
}

export type ContentMessage = StartAreaPinMessage | StartTextPinMessage | StartLivePinMessage;

export interface CaptureVisibleTabMessage {
  type: typeof MessageType.CaptureVisibleTab;
}

export type CaptureResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: string };

export type TabStreamResult =
  | { ok: true; streamId: string }
  | { ok: false; error: string };

export interface Ack {
  ok: boolean;
  error?: string;
}

/**
 * ヘルパーウィンドウに渡す表示内容。ImageBitmap はメッセージにも storage にも
 * 載せられないため、画像は PNG の data URL にして運ぶ（PNG は可逆なので劣化しない）。
 */
export interface AreaPipPayload {
  kind: 'area';
  imageDataUrl: string;
  /** 元ページでの選択範囲。ヘルパー側で窓の初期サイズを決めるのに使う。 */
  rect: Rect;
}

export interface TextPipPayload {
  kind: 'text';
  text: string;
}

/** Live Pin。ストリーム ID を映像に変換できるのは consumer に指定されたヘルパーだけ。 */
export interface LivePipPayload {
  kind: 'live';
  streamId: string;
  /** 元ページでの選択範囲（CSS ピクセル）。 */
  rect: Rect;
  /** 切り出し位置を映像の解像度へ換算するために使う。 */
  viewport: Viewport;
}

export type PipPayload = AreaPipPayload | TextPipPayload | LivePipPayload;

export type PipActivation =
  | { kind: 'area'; rect: Rect }
  | { kind: 'live'; rect: Rect }
  | { kind: 'text' };

export interface OpenPersistentPipMessage {
  type: typeof MessageType.OpenPersistentPip;
  payload: PipPayload;
}

export interface PersistentPipState {
  open: boolean;
}

/**
 * service worker とヘルパーの受け渡しに使う chrome.storage.session のキー。
 * session を選ぶのは、ブラウザを閉じたら消えてほしい一時データだから。
 */
export const SESSION_KEY = {
  payload: 'clippip/pip-payload',
  helperTabId: 'clippip/helper-tab-id',
  sourceTabId: 'clippip/source-tab-id',
  /** 旧版の一時ウィンドウ記録を掃除するために残す。 */
  helperWindowId: 'clippip/helper-window-id',
} as const;

/** PiP ウィンドウの初期サイズの目安。Area Pin は選択範囲の大きさで開くため最小値のみ使う。 */
export const PIP_SIZE = {
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
  get persistentPipLabel(): string {
    return chrome.i18n.getMessage('persistentPipLabel');
  },
  get helperTitle(): string {
    return chrome.i18n.getMessage('helperTitle');
  },
  get helperBody(): string {
    return chrome.i18n.getMessage('helperBody');
  },
  get helperAction(): string {
    return chrome.i18n.getMessage('helperAction');
  },
  get helperExpired(): string {
    return chrome.i18n.getMessage('helperExpired');
  },
  get returnToTab(): string {
    return chrome.i18n.getMessage('returnToTab');
  },
  get contextMenuAreaPin(): string {
    return chrome.i18n.getMessage('contextMenuAreaPin');
  },
  get contextMenuTextPin(): string {
    return chrome.i18n.getMessage('contextMenuTextPin');
  },
  get contextMenuLivePin(): string {
    return chrome.i18n.getMessage('contextMenuLivePin');
  },
  get liveCaptureFailed(): string {
    return chrome.i18n.getMessage('liveCaptureFailed');
  },
  get liveEnded(): string {
    return chrome.i18n.getMessage('liveEnded');
  },
  get badgeDefaultTitle(): string {
    return chrome.i18n.getMessage('badgeDefaultTitle');
  },
} as const;

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
