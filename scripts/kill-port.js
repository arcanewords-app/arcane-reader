#!/usr/bin/env node
/**
 * Kill process on specified port (cross-platform)
 * Usage: node scripts/kill-port.js [port]
 */

import { execSync } from 'child_process';

const port = process.argv[2] || 3000;

console.log(`🔍 Ищу процесс на порту ${port}...`);

try {
  if (process.platform === 'win32') {
    // Windows: find and kill process
    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8' });
    const lines = result.trim().split('\n');
    
    const pids = new Set();
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0' && !isNaN(pid)) {
        pids.add(pid);
      }
    }
    
    if (pids.size === 0) {
      console.log(`✅ Порт ${port} свободен`);
    } else {
      for (const pid of pids) {
        console.log(`🔪 Завершаю процесс PID ${pid}...`);
        try {
          execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf-8' });
          console.log(`✅ Процесс ${pid} завершён`);
        } catch (e) {
          // Process might already be dead
        }
      }
    }
  } else {
    // Unix/Mac: use lsof and kill
    try {
      const result = execSync(`lsof -ti:${port}`, { encoding: 'utf-8' });
      const pids = result.trim().split('\n').filter(Boolean);
      
      for (const pid of pids) {
        console.log(`🔪 Завершаю процесс PID ${pid}...`);
        execSync(`kill -9 ${pid}`);
        console.log(`✅ Процесс ${pid} завершён`);
      }
    } catch (e) {
      console.log(`✅ Порт ${port} свободен`);
    }
  }
} catch (e) {
  console.log(`✅ Порт ${port} свободен`);
}

console.log(`🚀 Порт ${port} освобождён, можно запускать сервер\n`);

