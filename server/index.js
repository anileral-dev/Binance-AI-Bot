import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runEngine,
  loadConfig,
  saveConfig,
  loadTrades,
  loadRunLog,
  saveRunLog,
  loadLessons,
  addLesson,
  getLivePositions,
  startScheduler,
} from "./engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dirname, "..", "dist");

const app = express();
app.use(express.json());

// ==================== OPSIYONEL SIFRE KORUMASI ====================
// APP_PASSWORD ortam degiskeni verilirse dashboard sifre ister.
// Verilmezse (varsayilan) korumasiz calisir.
const APP_USER = process.env.APP_USER || "admin";
const APP_PASSWORD = process.env.APP_PASSWORD || "";

if (APP_PASSWORD) {
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Basic ")) {
      res.set("WWW-Authenticate", 'Basic realm="Binance AI Bot"');
      return res.status(401).send("Giris gerekli");
    }
    const [user, pass] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    if (user === APP_USER && pass === APP_PASSWORD) return next();
    res.set("WWW-Authenticate", 'Basic realm="Binance AI Bot"');
    return res.status(401).send("Hatali giris");
  });
}

app.use(express.static(distPath));

// ==================== API ====================

app.get("/api", async (req, res) => {
  const action = req.query.action;
  try {
    if (action === "get-config") return res.json(loadConfig());

    if (action === "get-trades") {
      return res.json({ trades: loadTrades().slice().reverse(), lastRun: loadRunLog() });
    }

    if (action === "get-positions") {
      const cfg = loadConfig();
      try {
        return res.json(await getLivePositions(cfg));
      } catch (e) {
        return res.json({ balance: null, positions: [], error: e.message });
      }
    }

    if (action === "get-lessons") return res.json(loadLessons().slice().reverse());

    return res.status(400).json({ error: "Bilinmeyen islem: " + action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api", async (req, res) => {
  const action = req.query.action;
  try {
    if (action === "save-config") {
      const saved = saveConfig(req.body);
      return res.json({ ok: true, config: saved });
    }

    if (action === "add-feedback") {
      const { note } = req.body;
      if (!note || !note.trim()) return res.status(400).json({ ok: false, error: "Bos not" });
      const lessons = addLesson(note.trim());
      return res.json({ ok: true, lessons: lessons.slice().reverse() });
    }

    if (action === "run-now") {
      const result = await runEngine();
      saveRunLog(result);
      return res.json(result);
    }

    return res.status(400).json({ error: "Bilinmeyen islem: " + action });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SPA fallback - API disindaki tum yollar dashboard'a gitsin
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu calisiyor: http://0.0.0.0:${PORT}`);
  startScheduler();
});
