declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      email: string;
      /** User role from profiles (author | author_plus | super_author | admin). */
      role: 'guest' | 'author' | 'author_plus' | 'super_author' | 'admin';
    } | null;
    token?: string;
    /** Request ID (correlation). Set by requestContext middleware. */
    id?: string;
    /** Request-scoped logger. Set by requestContext middleware. */
    log?: import('pino').Logger;
  }
}
