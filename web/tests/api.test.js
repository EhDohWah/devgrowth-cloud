import { describe, test, expect, vi, beforeEach } from 'vitest';
import { api, ApiError, setUnauthorizedHandler } from '../src/api.js';

function respond(status, body) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body))
  });
}

beforeEach(() => setUnauthorizedHandler(() => {}));

describe('api', () => {
  test('sends the CSRF header, same-origin credentials and a JSON body', async () => {
    globalThis.fetch = respond(200, { ok: true });
    await api.post('/v1/events', { events: [] });
    const [path, init] = fetch.mock.calls[0];
    expect(path).toBe('/v1/events');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('same-origin');
    expect(init.headers['X-Requested-With']).toBe('devgrowth-web');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ events: [] });
  });

  test('omits the body and content type when there is none (e.g. logout)', async () => {
    globalThis.fetch = respond(204);
    await expect(api.post('/v1/auth/logout')).resolves.toBeNull();
    const [, init] = fetch.mock.calls[0];
    expect(init.body).toBeUndefined();
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  test('maps the server error shape to ApiError', async () => {
    globalThis.fetch = respond(409, { error: { code: 'email_taken', message: 'Taken', details: [1] } });
    const err = await api.post('/v1/auth/register', {}).catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'email_taken', message: 'Taken', details: [1] });
  });

  test('network failures become a friendly ApiError', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const err = await api.get('/v1/events').catch(e => e);
    expect(err).toMatchObject({ status: 0, code: 'network_error' });
  });

  test('a 401 on a data route triggers the unauthorized handler', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    globalThis.fetch = respond(401, { error: { code: 'unauthorized', message: 'Session expired' } });
    await expect(api.get('/v1/events')).rejects.toThrow('Session expired');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  test('a 401 from login or /v1/me does not (wrong password is not an expired session)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    globalThis.fetch = respond(401, { error: { code: 'invalid_credentials', message: 'Nope' } });
    await expect(api.post('/v1/auth/login', {})).rejects.toThrow();
    await expect(api.get('/v1/me')).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
