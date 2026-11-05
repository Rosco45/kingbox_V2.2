const DEFAULT_BASE = '/api';

export function getApiBase() {
  const saved = localStorage.getItem('kingbox_server_url')?.trim();
  if (saved) return `${saved.replace(/\/$/, '')}/api`;
  return DEFAULT_BASE;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Erreur API (${response.status})`);
  return data;
}
