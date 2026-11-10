import { config } from '../config/env.js';

export function requireLocalDemoDatabase(): void {
  const url = new URL(config.DATABASE_URL);
  const hosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  if (config.NODE_ENV === 'production' || !hosts.has(url.hostname)) {
    throw new Error('A demonstração só pode ser executada em desenvolvimento com PostgreSQL no próprio computador.');
  }
}
