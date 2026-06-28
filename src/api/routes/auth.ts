import type { Application } from 'express';
import { registerBodySchema, loginBodySchema, refreshBodySchema } from '../schemas/index.js';
import { hasAIProvider } from '../../config.js';

import { respondRouteError } from '../../middleware/routeDebugError.js';
import { getLoggingStatus } from '../../logger.js';

import { authService } from '../../services/authService.js';

import { handleHealthCheck } from '../routeHelpers.js';
import type { RouteDeps } from './deps.js';

export function registerAuthRoutes(app: Application, deps: RouteDeps): void {
  app.post('/api/auth/register', async (req, res) => {
    try {
      const parsed = registerBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { email, password } = parsed.data;
      const user = await authService.register(email, password);
      res.json({ user });
    } catch (error) {
      respondRouteError(req, res, error, {
        event: 'auth.register.failed',
        fallbackMessage: 'Registration failed',
        statusCode: 400,
      });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { email, password } = parsed.data;
      const user = await authService.login(email, password);

      // Get session token to return to client
      const session = await authService.getSession();

      res.json({
        user,
        session: session
          ? {
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              expires_at: session.expires_at,
            }
          : null,
      });
    } catch (error) {
      respondRouteError(req, res, error, {
        event: 'auth.login.failed',
        fallbackMessage: 'Login failed',
        statusCode: 401,
      });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      await authService.logout();
      res.json({ success: true });
    } catch (error) {
      respondRouteError(req, res, error, {
        event: 'auth.logout.failed',
        fallbackMessage: 'Logout failed',
        statusCode: 500,
      });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    try {
      // Get JWT token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix

      // Verify token and get user using the same style as middleware
      const user = await authService.getUserByToken(token);
      if (!user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      res.json({ user });
    } catch (error) {
      respondRouteError(req, res, error, {
        event: 'auth.me.failed',
        fallbackMessage: 'Failed to get user',
        statusCode: 500,
      });
    }
  });

  // Refresh session (exchange refresh_token for new access_token)
  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const parsed = refreshBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const { refresh_token: refreshToken } = parsed.data;
      const session = await authService.refreshSession(refreshToken);
      if (!session) {
        return res.status(401).json({ error: 'Invalid or expired refresh token' });
      }

      res.json({ session });
    } catch (error) {
      respondRouteError(req, res, error, {
        event: 'auth.refresh.failed',
        fallbackMessage: 'Refresh failed',
        statusCode: 500,
      });
    }
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      version: '0.1.0',
      ready: Boolean(deps.config.openai.apiKey),
      ai: {
        provider: deps.config.openai.apiKey ? 'OpenAI' : null,
        model: deps.config.openai.model,
        configured: hasAIProvider(deps.config),
      },
      config: {
        valid: deps.configValidation.valid,
        errors: deps.configValidation.errors,
      },
      storage: 'supabase',
      maxFileSizeBytes: deps.config.upload.maxFileSizeBytes,
      logging: getLoggingStatus(),
    });
  });

  app.get('/api/health', async (_req, res) => {
    await handleHealthCheck(res);
  });
}
