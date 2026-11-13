// api.js: kol el kalam ma3 el backend mn hena
export const BASE = import.meta.env.VITE_API ?? "http://localhost:8000";

export async function get(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
