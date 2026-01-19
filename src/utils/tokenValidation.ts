/**
 * Token validation utilities
 * Runtime validation for JWT tokens used with Supabase RLS
 */

/**
 * Validates token format and throws if invalid
 * @param token - JWT token string
 * @throws {Error} If token is invalid
 */
export function validateToken(token: string | undefined | null): asserts token is string {
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Token is required for RLS authentication. All database operations require a valid user token.');
  }

  // Basic JWT format validation (3 parts separated by dots: header.payload.signature)
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format: token must be a valid JWT (header.payload.signature)');
  }

  // Validate each part is non-empty
  if (parts.some(part => part.length === 0)) {
    throw new Error('Invalid token format: JWT parts cannot be empty');
  }
}

/**
 * Validates token and returns validated token (for type narrowing)
 */
export function requireToken(token: string | undefined | null): string {
  validateToken(token);
  return token;
}
