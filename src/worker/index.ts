/**
 * AI Apps Live — Autonomous Background Worker
 * Handles scheduled data collection, retries, and health monitors.
 */
import { Scheduler } from "./scheduler";

console.log("[Worker] Starting AI Apps Live worker...");

const scheduler = new Scheduler();
scheduler.start();

const shutdown = (signal: string) => {
  console.log(`[Worker] Received ${signal}. Shutting down gracefully...`);
  scheduler.stop();
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
