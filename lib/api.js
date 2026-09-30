// Helpers for the Pages Functions under functions/api. Kept outside functions/ so Pages doesn't turn them into routes.

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export const fail = (error, status = 400) => json({ ok: false, error }, status);

// A JSON object body, or null when it isn't one or is over maxBytes (whatever the headers said).
export async function readJson(request, maxBytes = 16 * 1024) {
  const text = await request.text();
  if (text.length > maxBytes) return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch (_) {
    return null;
  }
}
