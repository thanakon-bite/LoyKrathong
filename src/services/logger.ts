import "server-only";
import { getAdminSupabase } from "@/lib/supabase/admin";

type Level = "info" | "warn" | "error";

function serialize(err: unknown) {
  if (err instanceof Error) return { message: err.message, name: err.name, stack: err.stack?.split("\n").slice(0, 8).join("\n") };
  return { message: String(err) };
}

/** Writes to the error_logs table (visible in /admin) and to the server console. Never throws. */
export async function log(level: Level, source: string, message: string, context?: Record<string, unknown>) {
  const line = `[${level}] [${source}] ${message}`;
  if (level === "error") console.error(line, context ?? "");
  else if (level === "warn") console.warn(line, context ?? "");
  try {
    await getAdminSupabase()
      .from("error_logs")
      .insert({ level, source: source.slice(0, 100), message: message.slice(0, 1000), context: context ?? null });
  } catch {
    // logging must never break the request
  }
}

export async function logError(source: string, err: unknown, context?: Record<string, unknown>) {
  const s = serialize(err);
  await log("error", source, s.message, { ...context, ...s });
}
