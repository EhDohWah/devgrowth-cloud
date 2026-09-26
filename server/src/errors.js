/**
 * An error that maps directly to an API response:
 * `{ error: { code, message, details? } }` with the given HTTP status.
 */
export class HttpError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function errorBody(code, message, details) {
  return { error: { code, message, ...(details === undefined ? {} : { details }) } };
}
