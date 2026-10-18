const tokenKey = 'acium-webchat-token';

export function readPreference(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readToken() {
  const persisted = readPreference(tokenKey);
  if (persisted) return persisted;
  try {
    return sessionStorage.getItem(tokenKey);
  } catch {
    return null;
  }
}

export function writeToken(value) {
  const persisted = writePreference(tokenKey, value);
  try {
    if (value && !persisted) sessionStorage.setItem(tokenKey, value);
    else sessionStorage.removeItem(tokenKey);
  } catch {}
}

export function localStorageOrFallback() {
  try {
    return localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {
        throw new Error('Storage unavailable');
      },
    };
  }
}

export async function loginScope(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
