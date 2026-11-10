import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { config } from '../config/env.js';
import { AppError } from '../core/errors.js';

function encryptionKey(): Buffer {
  const key = Buffer.from(config.CONNECTOR_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new AppError('CONNECTOR_ENCRYPTION_KEY_REQUIRED', 503, 'Configure CONNECTOR_ENCRYPTION_KEY para armazenar credenciais.');
  }
  return key;
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptSecret(value: string): string {
  const buffer = Buffer.from(value, 'base64');
  if (buffer.length < 29) throw new AppError('CONNECTOR_SECRET_INVALID', 503, 'Credencial inválida.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString('utf8');
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return isPrivateAddress(value.slice(7));
  if (isIP(value) === 6) {
    return value === '::1' || value === '::' || value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('ff');
  }
  if (isIP(value) !== 4) return true;
  const [firstOctet = -1, secondOctet = -1] = value.split('.').map(Number);
  return (
    firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 169 && secondOctet === 254) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168) ||
    (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) ||
    (firstOctet === 192 && secondOctet === 0) ||
    (firstOctet === 198 && secondOctet >= 18 && secondOctet <= 19) ||
    firstOctet >= 224
  );
}

export async function validateEndpointAddress(address: string): Promise<URL> {
  let url: URL;
  try { url = new URL(address); } catch { throw new AppError('CONNECTOR_URL_INVALID', 400, 'URL inválida.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
    throw new AppError('CONNECTOR_URL_INVALID', 400, 'Use URL HTTP(S) sem usuário, senha ou fragmento.');
  }
  if (config.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new AppError('CONNECTOR_TLS_REQUIRED', 400, 'HTTPS é obrigatório em produção.');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname.endsWith('.local')) {
    if (!config.CONNECTOR_ALLOW_PRIVATE_HOSTS || config.NODE_ENV === 'production') {
      throw new AppError('CONNECTOR_PRIVATE_HOST_BLOCKED', 400, 'Endereços locais não estão habilitados.');
    }
  }
  const hostname = url.hostname.replace(/^\[/, '').replace(/\]$/, '');
  let records: Array<{ address: string }>;
  try {
    records = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError('CONNECTOR_DNS_FAILED', 502, 'Não foi possível resolver o endereço do endpoint.');
  }
  if (!records.length || records.some(item => isPrivateAddress(item.address))) {
    if (!config.CONNECTOR_ALLOW_PRIVATE_HOSTS || config.NODE_ENV === 'production') {
      throw new AppError('CONNECTOR_PRIVATE_HOST_BLOCKED', 400, 'Endereços privados não estão habilitados.');
    }
  }
  return url;
}
