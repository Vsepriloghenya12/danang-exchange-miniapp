export type TgWebApp = {
  initData: string;
  initDataUnsafe: any;
  ready: () => void;
  expand: () => void;
  sendData: (data: string) => void;

  // Homescreen shortcuts (Bot API 8.0+)
  addToHomeScreen?: () => void;
  checkHomeScreenStatus?: (cb?: (status: string) => void) => void;
  onEvent?: (eventType: string, eventHandler: (payload?: any) => void) => void;
  offEvent?: (eventType: string, eventHandler: (payload?: any) => void) => void;

  // UI helpers (Telegram client)
  showAlert?: (message: string) => void;
  showPopup?: (params: any) => void;
  HapticFeedback?: any;
};

export function getTg(): TgWebApp | null {
  const w = window as any;
  return w?.Telegram?.WebApp ?? null;
}

export function isTelegram(): boolean {
  return !!getTg();
}
