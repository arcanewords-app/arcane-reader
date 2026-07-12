/**
 * Zod validation error response — extracted from chapters routes.
 */

import type { ZodError } from 'zod';

export function validationFailedResponse(error: ZodError): {
  error: string;
  details: ReturnType<ZodError['flatten']>['fieldErrors'];
} {
  return {
    error: 'Validation failed',
    details: error.flatten().fieldErrors,
  };
}
