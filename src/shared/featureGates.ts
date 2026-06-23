/**
 * Feature access gates by user role.
 */

import type { UserRole } from '../types/roles.js';

/** Minimum role for chapter translation review (Critic mode). */
export const CRITIC_MIN_ROLE: UserRole = 'author_plus';

/** Minimum role for AI smart replace in project search. */
export const AI_REPLACE_MIN_ROLE: UserRole = 'author_plus';
