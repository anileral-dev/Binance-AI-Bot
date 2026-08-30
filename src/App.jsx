import { useCallback, useEffect, useState } from "react";

async function call(action, options) {
  const res = await fetch(`/api?action=${action}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Istek basarisiz (${res.status})`);
  return data;
}

const getConfig = () => call("get-config");
const saveConfigApi = (config) =>
  call("save-config", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(config),
  });
const getTrades = () => call("get-trades");
const getPositions = () => call("get-positions");
const getLessons = () => call("get-lessons");
const addFeedback = (note) =>
  call("add-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  });
const runNow = () => call("run-now");

function fmt(n, digits = 4) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Number(n).toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

// ==================== DASHBOARD ====================

function Dashboard({ config }) {
  const [posData, setPosData] = useState(null);
  const [posError, setPosError] = useState(null);
  const [tradesData, setTradesData] = useState({ trades: [], lastRun: null });
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState(null);

  const refresh = useCallback(() => {
    getPositions()
      .then((d) => { setPosData(d); setPosError(d.error || null); })
      .catch((e) => setPosError(e.message));
    getTrades().then(setTradesData).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleRunNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const result = await runNow();
      setRunResult(result);
      refresh();
    } catch (e) {
      setRunResult({ log: [`Hata: ${e.message}`] });
    } finally {
      setRunning(false);
    }
  };

  const hasKeys = config.binanceApiKey && config.anthropicApiKey;

  return (
    <div className="stack">
      {!hasKeys && (
        <div className="banner banner-warn">
          API anahtarların eksik. "Ayarlar" sekmesinden Binance ve Anthropic (Claude) anahtarlarını girip
          kaydetmeden bot çalışamaz.
        </div>
      )}

      <div className="grid-3">
        <div className="card stat-card">
          <div className="stat-label">Futures Bakiye (USDT)</div>
          <div className="stat-value">{posData ? fmt(posData.balance, 2) : "-"}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Açık Pozisyon</div>
          <div className="stat-value">{posData ? posData.positions.length : "-"} / {config.maxOpenPositions}</div>
        </div>
        <div className="card stat-card">
          <div className="stat-label">Mod</div>
          <div className="stat-value">{config.testnet ? "Testnet" : "Gerçek Para"}</div>
        </div>
      </div>

      {posError && <div className="banner banner-error">Pozisyon/bakiye alınamadı: {posError}</div>}

      <div className="card">
        <div className="card-header">
          <h3>Açık Pozisyonlar</h3>
          <button className="btn btn-primary" onClick={handleRunNow} disabled={running || !hasKeys}>
            {running ? "Çalışıyor..." : "Şimdi Çalıştır"}
          </button>
        </div>
        {posData && posData.positions.length === 0 && <div className="empty">Açık pozisyon yok.</div>}
        {posData && posData.positions.length > 0 && (
          <table className="table">
            <thead>
              <tr><th>Sembol</th><th>Yön</th><th>Miktar</th><th>Giriş Fiyatı</th></tr>
            </thead>
            <tbody>
              {posData.positions.map((p) => (
                <tr key={p.symbol}>
                  <td>{p.symbol}</td>
                  <td><span className={`side-pill ${p.side === "LONG" ? "side-long" : "side-short"}`}>{p.side}</span></td>
                  <td>{fmt(p.amount)}</td>
                  <td>{fmt(p.entryPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {runResult && (
        <div className="card">
          <h3>Son Çalıştırma Kaydı</h3>
          <pre className="log-box">{runResult.log.join("\n")}</pre>
        </div>
      )}

      {!runResult && tradesData.lastRun && (
        <div className="card">
          <h3>Son Otomatik Çalışma ({new Date(tradesData.lastRun.ranAt).toLocaleString("tr-TR")})</h3>
          <pre className="log-box">{tradesData.lastRun.log.join("\n")}</pre>
        </div>
      )}

      <div className="card">
        <h3>İşlem Geçmişi</h3>
        {tradesData.trades.length === 0 && <div className="empty">Henüz işlem yok.</div>}
        {tradesData.trades.length > 0 && (
          <table className="table">
            <thead>
              <tr><th>#</th><th>Zaman</th><th>Sembol</th><th>Aksiyon</th><th>Fiyat</th><th>Miktar</th><th>Güven</th><th>Gerekçe</th></tr>
            </thead>
            <tbody>
              {tradesData.trades.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{new Date(t.timestamp).toLocaleString("tr-TR")}</td>
                  <td>{t.symbol}</td>
                  <td><span className={`action-pill action-${t.action.toLowerCase()}`}>{t.action}</span></td>
                  <td>{fmt(t.price)}</td>
                  <td>{fmt(t.quantity)}</td>
                  <td>{t.confidence ?? "-"}</td>
                  <td className="reason-cell">{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ==================== AYARLAR ====================

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];

function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Settings({ config, setConfig }) {
  const [form, setForm] = useState(config);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSymbols = (value) => {
    update("symbols", value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await saveConfigApi(form);
      setConfig(res.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmLive = (checked) => {
    if (!checked) { update("testnet", true); return; }
    const ok = window.confirm(
      "GERÇEK PARA ile çalışacaksın. Bu ayarı kaydettiğinde bot artık gerçek bakiyenle işlem açabilir. Emin misin?"
    );
    update("testnet", !ok);
  };

  return (
    <form className="stack" onSubmit={handleSave}>
      <div className="card">
        <h3>API Anahtarları</h3>
        <div className="grid-2">
          <Field label="Binance API Key">
            <input type="password" value={form.binanceApiKey} onChange={(e) => update("binanceApiKey", e.target.value)} placeholder="Binance API key" />
          </Field>
          <Field label="Binance API Secret">
            <input type="password" value={form.binanceApiSecret} onChange={(e) => update("binanceApiSecret", e.target.value)} placeholder="Binance API secret" />
          </Field>
          <Field label="Anthropic (Claude) API Key">
            <input type="password" value={form.anthropicApiKey} onChange={(e) => update("anthropicApiKey", e.target.value)} placeholder="sk-ant-..." />
          </Field>
          <Field label="Claude Modeli">
            <input type="text" value={form.anthropicModel} onChange={(e) => update("anthropicModel", e.target.value)} />
          </Field>
        </div>
        <label className="checkbox-row">
          <input type="checkbox" checked={!form.testnet} onChange={(e) => confirmLive(e.target.checked)} />
          <span>Gerçek para ile çalıştır (işaretli değilse Binance <b>Testnet</b>'e bağlanır — sahte bakiye, risksiz test)</span>
        </label>
      </div>

      <div className="card">
        <h3>İşlem Ayarları</h3>
        <div className="grid-2">
          <Field label="Semboller (virgülle ayır)">
            <input type="text" value={form.symbols.join(",")} onChange={(e) => handleSymbols(e.target.value)} placeholder="BTCUSDT,ETHUSDT" />
          </Field>
          <Field label="Zaman Dilimi">
            <select value={form.timeframe} onChange={(e) => update("timeframe", e.target.value)}>
              {TIMEFRAMES.map((tf) => <option key={tf} value={tf}>{tf}</option>)}
            </select>
          </Field>
          <Field label="Kaldıraç (Leverage)">
            <input type="number" min="1" max="125" value={form.leverage} onChange={(e) => update("leverage", Number(e.target.value))} />
          </Field>
          <Field label="Maks. Açık Pozisyon Sayısı">
            <input type="number" min="1" value={form.maxOpenPositions} onChange={(e) => update("maxOpenPositions", Number(e.target.value))} />
          </Field>
        </div>
      </div>

      <div className="card">
        <h3>Bütçe & Risk Yönetimi</h3>
        <div className="grid-2">
          <Field label="İşlem Başına Risk (%)" hint="Bakiyenin yüzde kaçı marj olarak kullanılsın">
            <input type="number" step="0.1" min="0.1" value={form.riskPerTradePercent} onChange={(e) => update("riskPerTradePercent", Number(e.target.value))} />
          </Field>
          <Field label="Maks. Pozisyon Büyüklüğü (USDT)" hint="Yukarıdaki yüzdeyi tavanlayan mutlak sınır">
            <input type="number" min="1" value={form.maxPositionUSDT} onChange={(e) => update("maxPositionUSDT", Number(e.target.value))} />
          </Field>
          <Field label="Stop Loss (%)">
            <input type="number" step="0.1" min="0.1" value={form.stopLossPercent} onChange={(e) => update("stopLossPercent", Number(e.target.value))} />
          </Field>
          <Field label="Take Profit (%)">
            <input type="number" step="0.1" min="0.1" value={form.takeProfitPercent} onChange={(e) => update("takeProfitPercent", Number(e.target.value))} />
          </Field>
          <Field label="Günlük Maks. Kayıp (%)" hint="Bu yüzdeye ulaşılırsa bot o gün işlem yapmayı durdurur">
            <input type="number" step="0.5" min="0.5" value={form.maxDailyLossPercent} onChange={(e) => update("maxDailyLossPercent", Number(e.target.value))} />
          </Field>
        </div>
      </div>

      <div className="save-row">
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
        </button>
        {saved && <span className="save-ok">Kaydedildi.</span>}
        {error && <span className="save-error">Hata: {error}</span>}
      </div>
    </form>
  );
}

// ==================== KURALLAR & GERI BILDIRIM ====================

function Rules({ config, setConfig }) {
  const [rules, setRules] = useState(config.rules);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [lessons, setLessons] = useState([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { getLessons().then(setLessons).catch(() => {}); }, []);

  const handleSaveRules = async () => {
    setSaving(true);
    try {
      const res = await saveConfigApi({ ...config, rules });
      setConfig(res.config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleSendFeedback = async () => {
    if (!note.trim()) return;
    setSending(true);
    try {
      const res = await addFeedback(note.trim());
      setLessons(res.lessons);
      setNote("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="stack">
      <div className="card">
        <h3>Strateji Kuralları</h3>
        <p className="muted">Claude her karar öncesi bu metni okuyor. Ne kadar net ve spesifik yazarsan, kararlar o kadar tutarlı olur.</p>
        <textarea className="rules-textarea" value={rules} onChange={(e) => setRules(e.target.value)} rows={10} />
        <div className="save-row">
          <button className="btn btn-primary" onClick={handleSaveRules} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kuralları Kaydet"}
          </button>
          {saved && <span className="save-ok">Kaydedildi.</span>}
        </div>
      </div>

      <div className="card">
        <h3>Geri Bildirim / Bota "Ders" Ver</h3>
        <p className="muted">İşlem geçmişinde beğenmediğin bir kararı gördüğünde buraya not düş. Bot bir sonraki karardan itibaren bu notu dikkate alır.</p>
        <textarea
          className="rules-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Örnek: İşlem 12: RSI 28 iken LONG açmışsın ama trend zaten düşüşteydi, bu tip sinyale güvenme."
        />
        <div className="save-row">
          <button className="btn btn-primary" onClick={handleSendFeedback} disabled={sending || !note.trim()}>
            {sending ? "Gönderiliyor..." : "Gönder"}
          </button>
        </div>

        {lessons.length > 0 && (
          <div className="lessons-list">
            {lessons.map((l, i) => (
              <div key={i} className="lesson-item">
                <div className="lesson-time">{new Date(l.timestamp).toLocaleString("tr-TR")}</div>
                <div>{l.note}</div>
              </div>
            ))}
          </div>
        )}
        {lessons.length === 0 && <div className="empty">Henüz geri bildirim yok.</div>}
      </div>
    </div>
  );
}

// ==================== ANA UYGULAMA ====================

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Ayarlar" },
  { id: "rules", label: "Kurallar & Geri Bildirim" },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    getConfig().then(setConfig).catch((e) => setLoadError(e.message));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand"><span className="brand-dot" />Binance Futures AI Trade Bot</div>
        {config && (
          <div className={`mode-pill ${config.testnet ? "mode-test" : "mode-live"}`}>
            {config.testnet ? "TESTNET" : "GERÇEK PARA"}
          </div>
        )}
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {loadError && <div className="banner banner-error">Ayarlar yüklenemedi: {loadError}</div>}
        {!config && !loadError && <div className="loading">Yükleniyor...</div>}
        {config && tab === "dashboard" && <Dashboard config={config} />}
        {config && tab === "settings" && <Settings config={config} setConfig={setConfig} />}
        {config && tab === "rules" && <Rules config={config} setConfig={setConfig} />}
      </main>
    </div>
  );
}
