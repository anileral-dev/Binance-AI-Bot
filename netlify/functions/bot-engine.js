import { schedule } from "@netlify/functions";
import { runEngine, loadConfig, saveRunLog, isCandleCloseWindow } from "./_shared.js";

const scheduledHandler = async () => {
  const cfg = await loadConfig();

  if (!isCandleCloseWindow(cfg.timeframe)) {
    return { statusCode: 200, body: "skip: mum kapanis penceresi degil" };
  }

  const result = await runEngine();
  await saveRunLog(result);
  console.log(result.log.join("\n"));
  return { statusCode: 200, body: JSON.stringify(result) };
};

export const handler = schedule("*/5 * * * *", scheduledHandler);
