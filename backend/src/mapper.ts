import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  DATABASE_URL: z.string().min(1),
  INGEST_API_KEY: z.string().min(24),
  CONNECTOR_ENCRYPTION_KEY: z.string().default(''),
  CONNECTOR_ALLOW_PRIVATE_HOSTS: z.enum(['true','false']).default('false').transform(value => value === 'true'),
  LLM_PROVIDER: z.enum(['groq', 'gemini', 'ollama']).default('groq'),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(3000).max(60000).default(18000),
  GROQ_API_KEY: z.string().default(''),
  GROQ_MODEL: z.string().default('openai/gpt-oss-20b'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash-lite'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().default('llama3.2:3b')
});

export type Config = z.infer<typeof schema>;
export function parseConfig(values: NodeJS.ProcessEnv): Config {
  return schema.parse(values);
}
export const config = parseConfig(process.env);
