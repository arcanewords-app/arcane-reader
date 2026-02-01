declare namespace Express {
  export interface Request {
    user?: {
      id: string;
      email: string;
      /** User role from profiles (author | author_plus | super_author | admin). */
      role: 'guest' | 'author' | 'author_plus' | 'super_author' | 'admin';
    } | null;
    token?: string;
  }
}
