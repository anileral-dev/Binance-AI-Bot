import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

// ==================== BINANCE FUTURES CLIENT ====================

export class BinanceClient {
  constructor(apiKey, apiSecret, testnet) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseURL = testnet
      ? "https://testnet.binancefuture.com"
      : "https://fapi.binance.com";
  }

  sign(params) {
    const query = new URLSearchParams(params).toString();
    const signature = crypto.createHmac("sha256", this.apiSecret).update(query).digest("hex");
    return `${query}&signature=${signature}`;
  }

  async signedRequest(method, path, params = {}) {
    params.timestamp = Date.now();
    params.recvWindow = 5000;
    const query = this.sign(params);
    const url = `${this.baseURL}${path}?${query}`;
    const res = await fetch(url, { method, headers: { "X-MBX-APIKEY": this.apiKey } });
    const text = await res.text();
    if (!res.ok) throw new Error(`Binance hata (${res.status}): ${text}`);
    return text ? JSON.parse(text) : null;
  }

  async publicRequest(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = query ? `${this.baseURL}${path}?${query}` : `${this.baseURL}${path}`;
    const res = await fetch(url);
    const text = await res.text();
    if (!res.ok) throw new Error(`Binance hata (${res.status}): ${text}`);
    return JSON.parse(text);
  }

  async getKlines(symbol, interval, limit = 100) {
    const raw = await this.publicRequest("/fapi/v1/klines", { symbol, interval, limit });
    return raw.map((r) => ({
      open: parseFloat(r[1]),
      high: parseFloat(r[2]),
      low: parseFloat(r[3]),
      close: parseFloat(r[4]),
      volume: parseFloat(r[5]),
    }));
  }

  async getBalanceUSDT() {
    const data = await this.signedRequest("GET", "/fapi/v2/balance");
    const usdt = data.find((a) => a.asset === "USDT");
    return usdt ? parseFloat(usdt.availableBalance) : 0;
  }

  async getPosition(symbol) {
    const data = await this.signedRequest("GET", "/fapi/v2/positionRisk", { symbol });
    const p = Array.isArray(data) ? data.find((x) => x.symbol === symbol) : null;
    if (!p) return null;
    const amt = parseFloat(p.positionAmt);
    if (amt === 0) return null;
    return { side: amt > 0 ? "LONG" : "SHORT", amount: Math.abs(amt), entryPrice: parseFloat(p.entryPrice) };
  }

  async setLeverage(symbol, leverage) {
    await this.signedRequest("POST", "/fapi/v1/leverage", { symbol, leverage });
  }

  async getQuantityPrecision(symbol) {
    const info = await this.publicRequest("/fapi/v1/exchangeInfo");
    const s = info.symbols.find((x) => x.symbol === symbol);
    return s ? s.quantityPrecision : 3;
  }

  async placeMarketOrder(symbol, side, quantity, reduceOnly = false) {
    const params = { symbol, side, type: "MARKET", quantity };
    if (reduceOnly) params.reduceOnly = "true";
    return this.signedRequest("POST", "/fapi/v1/order", params);
  }

  async placeStopMarket(symbol, side, stopPrice) {
    return this.signedRequest("POST", "/fapi/v1/order", {
      symbol, side, type: "STOP_MARKET", stopPrice, closePosition: "true",
    });
  }

  async placeTakeProfitMarket(symbol, side, stopPrice) {
    return this.signedRequest("POST", "/fapi/v1/order", {
      symbol, side, type: "TAKE_PROFIT_MARKET", stopPrice, closePosition: "true",
    });
  }

  async cancelAllOpenOrders(symbol) {
    return this.signedRequest("DELETE", "/fapi/v1/allOpenOrders", { symbol });
  }
}

// ==================== TEKNIK GOSTERGELER ====================

function emaLast(values, period) {
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k);
  return ema;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  const n = closes.length;
  for (let i = n - period; i < n; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses += -change;
  }
  const avgGain = gains / period, avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function atr(klines, period = 14) {
  const n = klines.length;
  if (n < period + 1) return null;
  let sum = 0;
  for (let i = n - period; i < n; i++) {
    const h = klines[i].high, l = klines[i].low, pc = klines[i - 1].close;
    sum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return sum / period;
}

function round2(v) {
  return v === null || v === undefined ? null : Math.round(v * 100) / 100;
}

function buildMarketSummary(symbol, klines) {
  const n = klines.length;
  const closes = klines.map((k) => k.close);
  const vols = klines.map((k) => k.volume);
  const e50 = n >= 50 ? emaLast(closes, 50) : null;
  const window = n > 20 ? vols.slice(n - 20) : vols;
  const avgVol = window.reduce((a, b) => a + b, 0) / window.length;
  const change = n > 10 ? ((closes[n - 1] - closes[n - 11]) / closes[n - 11]) * 100 : 0;

  return {
    symbol,
    last_price: closes[n - 1],
    rsi_14: round2(rsi(closes, 14)),
    ema20: round2(emaLast(closes, 20)),
    ema50: round2(e50),
    atr_14: round2(atr(klines, 14)),
    last_volume: round2(vols[n - 1]),
    avg_volume_20: round2(avgVol),
    price_change_pct_last_10_candles: round2(change),
  };
}

// ==================== CLAUDE (ANTHROPIC) ====================

async function callClaude(apiKey, model, systemPrompt, userPrompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model, max_tokens: 500, system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Claude API hatasi (${res.status}): ${body}`);
  const data = JSON.parse(body);
  let text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  text = text.trim().replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Claude cevabi JSON degil: ${text}`);
  }
}

// ==================== DEPOLAMA (NETLIFY BLOBS) ====================

const configStore = () => getStore("config");
const tradesStore = () => getStore("trades");
const lessonsStore = () => getStore("lessons");
const stateStore = () => getStore("state");

export function defaultConfig() {
  return {
    binanceApiKey: "",
    binanceApiSecret: "",
    testnet: true,
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-5",
    symbols: ["BTCUSDT", "ETHUSDT"],
    timeframe: "15m",
    leverage: 5,
    riskPerTradePercent: 2,
    maxPositionUSDT: 200,
    stopLossPercent: 1.5,
    takeProfitPercent: 3.0,
    maxOpenPositions: 2,
    maxDailyLossPercent: 5,
    rules:
      "Sadece net bir trend varsa islem ac, yatay piyasada WAIT de.\n" +
      "RSI 30 altindaysa ve fiyat EMA50 uzerine donuyorsa LONG dusun.\n" +
      "RSI 70 ustundeyse ve momentum zayifliyorsa SHORT dusun.\n" +
      "Hacim ortalamanin altindaysa islem acma.\n" +
      "Emin degilsen WAIT de, zorla islem acma.",
  };
}

export async function loadConfig() {
  const cfg = await configStore().get("settings", { type: "json" });
  return cfg ? { ...defaultConfig(), ...cfg } : defaultConfig();
}

export async function saveConfig(cfg) {
  await configStore().setJSON("settings", cfg);
  return cfg;
}

export async function loadTrades() {
  const t = await tradesStore().get("log", { type: "json" });
  return t || [];
}

async function appendTrade(trade) {
  const trades = await loadTrades();
  const record = { id: trades.length + 1, timestamp: new Date().toISOString(), ...trade };
  trades.push(record);
  await tradesStore().setJSON("log", trades.slice(-500));
  return record;
}

export async function loadLessons() {
  const l = await lessonsStore().get("notes", { type: "json" });
  return l || [];
}

export async function addLesson(note) {
  const lessons = await loadLessons();
  lessons.push({ timestamp: new Date().toISOString(), note });
  const trimmed = lessons.slice(-100);
  await lessonsStore().setJSON("notes", trimmed);
  return trimmed;
}

function lessonsToPromptText(lessons) {
  const text = lessons.map((l) => `[${l.timestamp}] ${l.note}`).join("\n");
  return text.length > 3000 ? text.slice(-3000) : text;
}

async function loadDailyState() {
  return (await stateStore().get("daily", { type: "json" })) || null;
}

async function saveDailyState(state) {
  await stateStore().setJSON("daily", state);
}

export async function loadRunLog() {
  return (await stateStore().get("last-run", { type: "json" })) || null;
}

export async function saveRunLog(entry) {
  await stateStore().setJSON("last-run", entry);
}

// ==================== ZAMANLAMA (MUM KAPANIS KONTROLU) ====================

const TF_SECONDS = { "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400 };

export function isCandleCloseWindow(timeframe, toleranceSeconds = 300) {
  const sec = TF_SECONDS[timeframe] || 900;
  const now = Math.floor(Date.now() / 1000);
  return now % sec < toleranceSeconds;
}

// ==================== KARAR VE ISLEM MOTORU ====================

function buildPrompts(rules, symbol, summary, position, lessonsText) {
  const systemPrompt =
    "Sen bir kripto vadeli islem (futures) karar motorusun. Sana bir sembolun guncel piyasa " +
    "verisi ve kullanicinin belirledigi kural seti verilecek. SADECE asagidaki JSON formatinda " +
    "cevap ver, baska hicbir metin ekleme (markdown, aciklama, kod blogu YOK):\n" +
    '{"action": "LONG" | "SHORT" | "CLOSE" | "WAIT", "confidence": 0-100, "reason": "kisa aciklama"}\n' +
    "Kurallara uymuyorsa ya da emin degilsen WAIT de. Kullanicinin gecmis geri bildirimlerini dikkate al.";

  const lessonsBlock = lessonsText
    ? `\nKullanicinin gecmis geri bildirimleri (ogrenilen dersler):\n${lessonsText}\n`
    : "";

  const positionBlock = position
    ? `Acik pozisyon: ${position.side}, giris fiyati: ${position.entryPrice}, miktar: ${position.amount}`
    : "Su anda acik pozisyon yok.";

  const userPrompt =
    `KURAL SETI:\n${rules}\n${lessonsBlock}\n` +
    `PIYASA VERISI (${symbol}):\n${JSON.stringify(summary)}\n` +
    `POZISYON DURUMU:\n${positionBlock}\n\nBu bilgilere gore kararini JSON formatinda ver.`;

  return { systemPrompt, userPrompt };
}

function calcQuantity(balance, price, riskPercent, maxPositionUSDT, leverage, precision) {
  const margin = Math.min(balance * (riskPercent / 100), maxPositionUSDT);
  const qty = (margin * leverage) / price;
  const mult = Math.pow(10, precision);
  return Math.floor(qty * mult) / mult;
}

async function checkDailyLossLimit(client, maxLossPercent, log) {
  const today = new Date().toISOString().slice(0, 10);
  const balance = await client.getBalanceUSDT();
  let state = await loadDailyState();
  if (!state || state.date !== today) {
    state = { date: today, startBalance: balance };
    await saveDailyState(state);
    return true;
  }
  if (!state.startBalance || state.startBalance <= 0) return true;
  const lossPercent = ((state.startBalance - balance) / state.startBalance) * 100;
  if (lossPercent >= maxLossPercent) {
    log.push(`[UYARI] Gunluk kayip limiti asildi (%${lossPercent.toFixed(2)}), islem durduruldu.`);
    return false;
  }
  return true;
}

async function countOpenPositions(client, symbols) {
  let count = 0;
  for (const s of symbols) if (await client.getPosition(s)) count++;
  return count;
}

async function processSymbol(client, cfg, symbol, lessonsText, log) {
  const klines = await client.getKlines(symbol, cfg.timeframe, 100);
  if (klines.length < 30) {
    log.push(`[${symbol}] Yeterli veri yok.`);
    return;
  }

  const summary = buildMarketSummary(symbol, klines);
  const position = await client.getPosition(symbol);
  const { systemPrompt, userPrompt } = buildPrompts(cfg.rules, symbol, summary, position, lessonsText);
  const decision = await callClaude(cfg.anthropicApiKey, cfg.anthropicModel, systemPrompt, userPrompt);

  const action = (decision.action || "WAIT").toUpperCase();
  const price = summary.last_price;
  log.push(`[${symbol}] Karar: ${action} (guven: ${decision.confidence}) - ${decision.reason}`);

  if (action === "WAIT") return;

  if (action === "CLOSE") {
    if (position) {
      const side = position.side === "LONG" ? "SELL" : "BUY";
      await client.placeMarketOrder(symbol, side, position.amount, true);
      await client.cancelAllOpenOrders(symbol);
      await appendTrade({ symbol, action: "CLOSE", price, quantity: position.amount, reason: decision.reason, confidence: decision.confidence });
      log.push(`[${symbol}] Pozisyon kapatildi.`);
    }
    return;
  }

  if (action === "LONG" || action === "SHORT") {
    if (position && position.side === action) {
      log.push(`[${symbol}] Zaten ayni yonde pozisyon acik.`);
      return;
    }
    if (position && position.side !== action) {
      const side = position.side === "LONG" ? "SELL" : "BUY";
      await client.placeMarketOrder(symbol, side, position.amount, true);
      await client.cancelAllOpenOrders(symbol);
      log.push(`[${symbol}] Ters yon sinyali, mevcut pozisyon kapatildi.`);
    }

    if ((await countOpenPositions(client, cfg.symbols)) >= cfg.maxOpenPositions) {
      log.push(`[${symbol}] Maksimum acik pozisyon sayisina ulasildi.`);
      return;
    }

    const balance = await client.getBalanceUSDT();
    const precision = await client.getQuantityPrecision(symbol);
    try {
      await client.setLeverage(symbol, cfg.leverage);
    } catch (e) {
      log.push(`[${symbol}] Kaldirac ayarlanamadi: ${e.message}`);
    }

    const quantity = calcQuantity(balance, price, cfg.riskPerTradePercent, cfg.maxPositionUSDT, cfg.leverage, precision);
    if (quantity <= 0) {
      log.push(`[${symbol}] Hesaplanan miktar 0.`);
      return;
    }

    await client.placeMarketOrder(symbol, action === "LONG" ? "BUY" : "SELL", quantity, false);

    const slPct = cfg.stopLossPercent / 100, tpPct = cfg.takeProfitPercent / 100;
    let slPrice, tpPrice, closeSide;
    if (action === "LONG") {
      slPrice = price * (1 - slPct); tpPrice = price * (1 + tpPct); closeSide = "SELL";
    } else {
      slPrice = price * (1 + slPct); tpPrice = price * (1 - tpPct); closeSide = "BUY";
    }

    try { await client.placeStopMarket(symbol, closeSide, slPrice); } catch (e) { log.push(`[${symbol}] SL kurulamadi: ${e.message}`); }
    try { await client.placeTakeProfitMarket(symbol, closeSide, tpPrice); } catch (e) { log.push(`[${symbol}] TP kurulamadi: ${e.message}`); }

    await appendTrade({ symbol, action, price, quantity, reason: decision.reason, confidence: decision.confidence, stopLoss: slPrice, takeProfit: tpPrice });
    log.push(`[${symbol}] ${action} pozisyonu acildi. Miktar: ${quantity}, SL: ${slPrice.toFixed(4)}, TP: ${tpPrice.toFixed(4)}`);
  }
}

export async function runEngine() {
  const log = [];
  const cfg = await loadConfig();

  if (!cfg.binanceApiKey || !cfg.binanceApiSecret || !cfg.anthropicApiKey) {
    log.push("API anahtarlari eksik. Ayarlar sayfasindan doldurup kaydedin.");
    return { log, skipped: true, ranAt: new Date().toISOString() };
  }

  const client = new BinanceClient(cfg.binanceApiKey, cfg.binanceApiSecret, cfg.testnet);
  const lessonsText = lessonsToPromptText(await loadLessons());

  if (await checkDailyLossLimit(client, cfg.maxDailyLossPercent, log)) {
    for (const symbol of cfg.symbols) {
      try {
        await processSymbol(client, cfg, symbol, lessonsText, log);
      } catch (e) {
        log.push(`[${symbol}] Hata: ${e.message}`);
      }
    }
  }

  return { log, skipped: false, ranAt: new Date().toISOString() };
}

export async function getLivePositions(cfg) {
  if (!cfg.binanceApiKey || !cfg.binanceApiSecret) return { balance: null, positions: [], error: null };
  const client = new BinanceClient(cfg.binanceApiKey, cfg.binanceApiSecret, cfg.testnet);
  const balance = await client.getBalanceUSDT();
  const positions = [];
  for (const s of cfg.symbols) {
    const p = await client.getPosition(s);
    if (p) positions.push({ symbol: s, ...p });
  }
  return { balance, positions, error: null };
}
