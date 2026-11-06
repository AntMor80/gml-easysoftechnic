export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Llamada JSON al servidor (misma dirección que la web, la sesión va en una cookie). */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: unknown = undefined;
  try {
    data = text ? JSON.parse(text) : undefined;
  } catch {
    /* respuesta no JSON (p. ej. la web en modo desarrollo sin servidor) */
  }
  if (!res.ok || data === undefined) {
    const msg = (data as { error?: string } | undefined)?.error ?? `Error ${res.status}`;
    throw new ApiError(res.ok ? 0 : res.status, msg);
  }
  return data as T;
}
