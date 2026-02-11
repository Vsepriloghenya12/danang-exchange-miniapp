export type TgWebApp = {
  initData: string;
  initDataUnsafe: any;
  ready: () => void;
  expand: () => void;
  sendData: (data: string) => void;
};

export function getTg(): TgWebApp | null {
  const w = window as any;
  return w?.Telegram?.WebApp ?? null;
}

export function isTelegram(): boolean {
  return !!getTg();
}
