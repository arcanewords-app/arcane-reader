import type { Application } from 'express';
import type { RouteDeps } from './deps.js';
import {
  handleAuthMe,
  handleHealth,
  handleLogin,
  handleLogout,
  handleRefresh,
  handleRegister,
  handleStatus,
} from './handlers/authHandlers.js';

export function registerAuthRoutes(app: Application, deps: RouteDeps): void {
  app.post('/api/auth/register', handleRegister);
  app.post('/api/auth/login', handleLogin);
  app.post('/api/auth/logout', handleLogout);
  app.get('/api/auth/me', handleAuthMe);
  app.post('/api/auth/refresh', handleRefresh);
  app.get('/api/status', handleStatus(deps));
  app.get('/api/health', handleHealth);
}
