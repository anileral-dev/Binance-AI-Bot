import {
  loadConfig,
  saveConfig,
  loadTrades,
  loadRunLog,
  saveRunLog,
  loadLessons,
  addLesson,
  runEngine,
  getLivePositions,
} from "./_shared.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "get-config") {
      return json(await loadConfig());
    }

    if (action === "save-config") {
      const body = await req.json();
      const saved = await saveConfig(body);
      return json({ ok: true, config: saved });
    }

    if (action === "get-trades") {
      const trades = await loadTrades();
      const lastRun = await loadRunLog();
      return json({ trades: trades.slice().reverse(), lastRun });
    }

    if (action === "get-positions") {
      const cfg = await loadConfig();
      try {
        return json(await getLivePositions(cfg));
      } catch (e) {
        return json({ balance: null, positions: [], error: e.message });
      }
    }

    if (action === "get-lessons") {
      const lessons = await loadLessons();
      return json(lessons.slice().reverse());
    }

    if (action === "add-feedback") {
      const { note } = await req.json();
      if (!note || !note.trim()) return json({ ok: false, error: "Bos not" }, 400);
      const lessons = await addLesson(note.trim());
      return json({ ok: true, lessons: lessons.slice().reverse() });
    }

    if (action === "run-now") {
      const result = await runEngine();
      await saveRunLog(result);
      return json(result);
    }

    return json({ error: "Bilinmeyen islem: " + action }, 400);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};
