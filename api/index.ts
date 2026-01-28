/**
 * Vercel API handler - Express server wrapper
 * 
 * This file exports the Express app for Vercel to use.
 * All routes from server.ts work as-is through this wrapper.
 * 
 * Vercel will automatically route all /api/* requests to this handler.
 */

// Import Express app from server.ts
// The app is exported as default, so we re-export it
import app from '../src/server.js';

// Export Express app for Vercel
// Vercel will use @vercel/node to wrap this Express app
export default app;
