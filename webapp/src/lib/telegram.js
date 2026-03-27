export function getTg() {
    const w = window;
    return w?.Telegram?.WebApp ?? null;
}
export function isTelegram() {
    return !!getTg();
}
