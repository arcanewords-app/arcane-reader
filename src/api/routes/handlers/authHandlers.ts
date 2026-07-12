import type { Request, Response } from 'express';
import { registerBodySchema, loginBodySchema, refreshBodySchema } from '../../schemas/index.js';
import { hasAIProvider } from '../../../config.js';
import { respondRouteError } from '../../../middleware/routeDebugError.js';
import { getLoggingStatus } from '../../../logger.js';
import { authService } from '../../../services/authService.js';
import { handleHealthCheck } from '../../routeHelpers.js';
import type { RouteDeps } from '../deps.js';

export async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
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
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { email, password } = parsed.data;
    const user = await authService.login(email, password);
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
}

export async function handleLogout(_req: Request, res: Response): Promise<void> {
  try {
    await authService.logout();
    res.json({ success: true });
  } catch (error) {
    respondRouteError(_req, res, error, {
      event: 'auth.logout.failed',
      fallbackMessage: 'Logout failed',
      statusCode: 500,
    });
  }
}

export async function handleAuthMe(req: Request, res: Response): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    const token = authHeader.substring(7);
    const user = await authService.getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user });
  } catch (error) {
    respondRouteError(req, res, error, {
      event: 'auth.me.failed',
      fallbackMessage: 'Failed to get user',
      statusCode: 500,
    });
  }
}

export async function handleRefresh(req: Request, res: Response): Promise<void> {
  try {
    const parsed = refreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { refresh_token: refreshToken } = parsed.data;
    const session = await authService.refreshSession(refreshToken);
    if (!session) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }
    res.json({ session });
  } catch (error) {
    respondRouteError(req, res, error, {
      event: 'auth.refresh.failed',
      fallbackMessage: 'Refresh failed',
      statusCode: 500,
    });
  }
}

export function handleStatus(deps: RouteDeps) {
  return (_req: Request, res: Response): void => {
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
  };
}

export async function handleHealth(_req: Request, res: Response): Promise<void> {
  await handleHealthCheck(res);
}
