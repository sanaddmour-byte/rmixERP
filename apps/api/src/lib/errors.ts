export interface ApiErrorBody {
  error: { message: string; code: string; details?: unknown };
}

export function errorBody(message: string, code: string, details?: unknown): ApiErrorBody {
  return details === undefined ? { error: { message, code } } : { error: { message, code, details } };
}

export const notFound = (entity: string): ApiErrorBody => errorBody(`${entity} not found`, "not_found");
export const validationError = (details?: unknown): ApiErrorBody =>
  errorBody("Invalid request body", "validation_error", details);
