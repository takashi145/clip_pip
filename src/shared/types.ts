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

export const UI_TEXT = {
  pipUnsupported: 'このブラウザではPicture-in-Picture表示に対応していません。',
  captureFailed: 'このページでは範囲をキャプチャできませんでした。',
  pipFailed: 'PiPウィンドウを開けませんでした。',
  restrictedPage: 'このページではClipPiPを利用できません。',
  pdfNotSupported: 'ChromeのPDFビューアではClipPiPを利用できません。',
  fileAccessRequired:
    'ローカルファイルで使うには、拡張機能の詳細で「ファイルのURLへのアクセスを許可する」を有効にしてください。',
  reloadRequired: 'ページを再読み込みしてから、もう一度お試しください。',
  noActiveTab: '対象のタブが見つかりませんでした。',
  noSelection: 'テキストが選択されていません。',
  busy: 'ClipPiPは別の操作を実行中です。',
  startFailed: '開始できませんでした。ページを再読み込みしてお試しください。',
  selectHint: 'ドラッグで範囲を選択（Escでキャンセル）',
  activationPrompt: 'PiPウィンドウを開くにはクリックしてください。',
  activationAction: 'PiP表示',
  switchTitle: '表示中のPiPを閉じます',
  switchBody:
    'Chromeは同時に1つのPiPしか開けません。新しくPiP表示すると、いま表示している内容は閉じられます。',
  switchAction: '閉じて切り替える',
  cancelAction: 'キャンセル',
  dontAskAgain: '次回から確認しない',
  confirmSwitchLabel: 'PiPを切り替える前に確認する',
} as const;

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
