// Thin fetch wrapper for the devgrowth-cloud API (see docs/api.md).
// The session lives in an httpOnly cookie the browser attaches for us; every
// request also carries the CSRF header the server requires for cookie writes.

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let onUnauthorized = () => {};

/** Called when a request fails with 401 because the session ended (not for login attempts). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

// A 401 from these means "wrong password" or "not signed in yet", not "session
// expired", so they must not trigger the global redirect.
const QUIET_401 = ['/v1/auth/', '/v1/me'];

export async function request(method, path, body) {
  const headers = { 'X-Requested-With': 'devgrowth-web' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error;
    const apiError = new ApiError(
      res.status,
      err?.code ?? 'http_error',
      err?.message ?? `Request failed (${res.status})`,
      err?.details
    );
    if (res.status === 401 && !QUIET_401.some(prefix => path.startsWith(prefix))) {
      onUnauthorized(apiError);
    }
    throw apiError;
  }
  return data;
}

export const api = {
  get: path => request('GET', path),
  post: (path, body) => request('POST', path, body),
  del: path => request('DELETE', path)
};
