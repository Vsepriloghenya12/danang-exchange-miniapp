import express from "express";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

// A disposable local store; no bot is started and no production credentials are loaded.
const scratch = await mkdtemp(join(tmpdir(), "cashalot-design-"));
process.env.STORE_PATH = join(scratch, "store.json");
delete process.env.DATABASE_URL;
delete process.env.ADMIN_WEB_KEY;
const { mutateStore } = await import("../server/src/store.ts");
const { createApiRouter } = await import("../server/src/routes.ts");
const sampleRates = {
  RUB: { buy_vnd: 305, sell_vnd: 325 }, USD: { buy_vnd: 25400, sell_vnd: 26000 },
  USDT: { buy_vnd: 25800, sell_vnd: 26300 }, EUR: { buy_vnd: 29100, sell_vnd: 30400 },
  THB: { buy_vnd: 780, sell_vnd: 830 }, KZT: { buy_vnd: 49, sell_vnd: 53 },
};
await mutateStore(s => {
  s.ratesByDate[new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" })] = { updated_at: new Date().toISOString(), updated_by: 0, rates: sampleRates };
});
const app = express();
app.use(express.json());
app.use("/api", (req, res, next) => {
  if (req.method !== "GET") return res.status(400).json({ ok: false, error: "Локальный просмотр: заявки не отправляются." });
  next();
});
app.get("/api/market", (_req, res) => res.json({ ok: true, updated_at: new Date().toISOString(), source: "local-preview", stale: false, g: { "USD/RUB": 85, "USDT/RUB": 85, "EUR/RUB": 98, "THB/RUB": 2.6, "USD/USDT": 1, "EUR/USD": 1.15, "EUR/USDT": 1.15, "USD/THB": 33, "USDT/THB": 33, "EUR/THB": 38, "KZT/RUB": .16, "USD/KZT": 540, "USDT/KZT": 540, "EUR/KZT": 621, "THB/KZT": 16.4 } }));
app.get("/api/rates/today", (req, res) => {
  const now = new Date();
  const stamp = new Date(now); stamp.setUTCHours(5, 0, 0, 0);
  res.json({ ok: true, date: now.toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }), data: { rates: sampleRates, updated_at: stamp.toISOString(), updated_by: 0 } });
});
app.use("/api", createApiRouter({ botToken: "123:local-design-preview" }));
app.use(express.static(resolve("server/public")));
app.get("/design", async (_req, res) => res.type("html").send(await readFile(resolve("scripts/design-preview.html"), "utf8")));
app.use(express.static(resolve(".design-preview-dist"), { index: false, maxAge: 0, setHeaders: res => res.setHeader("Cache-Control", "no-store") }));
app.get("*", async (req, res, next) => {
  try {
    let html = await readFile(resolve(".design-preview-dist/index.html"), "utf8");
    // Preview controls exist only in this local server. The application keeps its real clock.
    const fixture = `<script>
      const previewParams = new URLSearchParams(location.search);
      window.Telegram = { WebApp: { initData: '', initDataUnsafe: {}, ready() {}, expand() {}, showAlert: text => alert(text), showPopup: data => alert(data.title + '\\n\\n' + data.message) } };
      if (previewParams.has('previewTheme')) localStorage.setItem('mx_theme', previewParams.get('previewTheme') === 'dark' ? 'dark' : 'light');
      const NativeDate = Date;
      const instant = new NativeDate();
      const target = new NativeDate(instant);
      target.setUTCHours(previewParams.get('previewTime') === 'night' ? 16 : 5, 3, 0, 0);
      const offset = target.getTime() - instant.getTime();
      window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [NativeDate.now() + offset])); } static now() { return NativeDate.now() + offset; } };
    </script>`;
    html = html.replace('<script src="https://telegram.org/js/telegram-web-app.js"></script>', fixture);
    res.setHeader("Cache-Control", "no-store");
    res.type("html").send(html);
  } catch (e) { next(e); }
});
app.listen(5188, "127.0.0.1", () => console.log("Design preview: http://127.0.0.1:5188/design"));
