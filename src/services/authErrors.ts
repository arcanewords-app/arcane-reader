/**
 * Structured auth errors with upstream Supabase Auth metadata for debug logging.
 */

export class AuthServiceError extends Error {
  readonly operation: string;
  readonly upstreamCode?: string;
  readonly upstreamStatus?: number;
  readonly upstreamMessage: string;

  constructor(
    operation: string,
    upstreamMessage: string,
    details?: { code?: string; upstreamStatus?: number }
  ) {
    const prefix =
      operation === 'register'
        ? 'Registration failed'
        : operation === 'login'
          ? 'Login failed'
          : operation === 'logout'
            ? 'Logout failed'
            : operation === 'session'
              ? 'Get session failed'
              : 'Auth failed';

    super(`${prefix}: ${upstreamMessage}`);
    this.name = 'AuthServiceError';
    this.operation = operation;
    this.upstreamMessage = upstreamMessage;
    this.upstreamCode = details?.code;
    this.upstreamStatus = details?.upstreamStatus;
  }
}

export function authErrorFromSupabase(
  operation: string,
  error: { message?: string; code?: string; status?: number }
): AuthServiceError {
  return new AuthServiceError(operation, error.message ?? 'Unknown auth error', {
    code: error.code,
    upstreamStatus: error.status,
  });
}
