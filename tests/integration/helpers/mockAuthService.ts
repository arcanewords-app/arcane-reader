import { vi } from 'vitest';

export const authServiceMocks = {
  login: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  getUserByToken: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
};

export function resetAuthServiceMocks(): void {
  for (const fn of Object.values(authServiceMocks)) {
    fn.mockReset();
  }
  authServiceMocks.login.mockRejectedValue(new Error('Invalid credentials'));
  authServiceMocks.getSession.mockResolvedValue(null);
  authServiceMocks.refreshSession.mockResolvedValue(null);
  authServiceMocks.getUserByToken.mockResolvedValue(null);
  authServiceMocks.register.mockResolvedValue(null);
  authServiceMocks.logout.mockResolvedValue(undefined);
}

resetAuthServiceMocks();

export function installAuthServiceMocks() {
  return {
    authService: authServiceMocks,
  };
}
