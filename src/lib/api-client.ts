export class ClientApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** fetch wrapper that surfaces the API's Thai error messages */
export async function apiFetch<T>(input: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(input, {
      ...rest,
      headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ClientApiError(0, "network", "เชื่อมต่ออินเทอร์เน็ตไม่ได้ กรุณาตรวจสอบการเชื่อมต่อ");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ClientApiError(res.status, err?.code ?? "error", err?.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
  }
  return data as T;
}
