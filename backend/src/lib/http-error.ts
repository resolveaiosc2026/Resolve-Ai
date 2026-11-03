export type ErrorDetail = { path?: string; message: string };

/** An error with an HTTP status and a stable machine-readable code, rendered by the error handler. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: ErrorDetail[]) =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const notFound = (message: string) => new HttpError(404, 'NOT_FOUND', message);

export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
