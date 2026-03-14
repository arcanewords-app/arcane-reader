import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { SystemStatus } from '../types';

const SystemStatusContext = createContext<SystemStatus | null>(null);

export const SystemStatusProvider = SystemStatusContext.Provider;

export function useSystemStatus(): SystemStatus | null {
  return useContext(SystemStatusContext);
}
