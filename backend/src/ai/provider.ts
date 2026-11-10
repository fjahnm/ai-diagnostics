import { config } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { outputJsonSchema } from './schema.js';
import { SYSTEM_PROMPT } from './prompt.js';

const MAX_GROQ_COMPLETION_TOKENS = 16384;

export interface ProviderInfo { provider: 'groq'|'gemini'|'ollama'; model: string; configured: boolean }

export function getProviderInfo(): ProviderInfo {
  if (config.LLM_PROVIDER === 'groq') return {
    provider: 'groq', model: config.GROQ_MODEL, configured: Boolean(config.GROQ_API_KEY)
  };
  if (config.LLM_PROVIDER === 'gemini') return {
    provider: 'gemini', model: config.GEMINI_MODEL, configured: Boolean(config.GEMINI_API_KEY)
  };
  return { provider:'ollama', model: config.OLLAMA_MODEL, configured: true };
}

function mapHttpError(status: number): AppError {
  if (status === 429) return new AppError('LLM_RATE_LIMIT',503,'Limite de requisições do provedor atingido.');
  if (status === 401 || status === 403) return new AppError('LLM_AUTH_ERROR',503,'Credenciais do provedor não foram aceitas.');
  if ([502,503,504].includes(status)) return new AppError('LLM_UNAVAILABLE',503,'Provedor temporariamente indisponível.');
  return new AppError('LLM_HTTP_ERROR',502,`Provedor retornou HTTP ${status}.`);
}

function logProviderRejection(status: number, body: string): void {
  if (config.NODE_ENV !== 'development') return;

  let error: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(body);
    const candidate = parsed?.error ?? parsed;
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      error = candidate as Record<string, unknown>;
    }
  } catch {
    // A resposta de erro do provedor pode não ser JSON.
  }

  function safeField(value: unknown, maxLength = 120): string | undefined {
    if (typeof value !== 'string') return undefined;
    let result = value;
    for (const secret of [config.GROQ_API_KEY, config.GEMINI_API_KEY]) {
      if (secret) result = result.replaceAll(secret, '[REDACTED]');
    }
    return result
      .replace(/\b(?:gsk_[a-z0-9_-]+|AIza[a-z0-9_-]+)\b/gi, '[REDACTED]')
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .slice(0, maxLength);
  }

  console.error(JSON.stringify({
    event: 'llm_provider_rejection',
    provider: config.LLM_PROVIDER,
    status,
    code: safeField(error.code),
    type: safeField(error.type),
    param: safeField(error.param),
    detail: safeField(error.message, 450)
  }));
}

function truncatedStructuredOutput(status: number, body: string): boolean {
  if (status !== 400) return false;
  try {
    const parsed = JSON.parse(body);
    const error = parsed?.error ?? parsed;
    return error?.code === 'json_validate_failed'
      && typeof error?.message === 'string'
      && /max[_ ]completion[_ ]tokens/i.test(error.message)
      && /truncat|reached/i.test(error.message);
  } catch {
    return false;
  }
}

async function requestJson(
  url: string,
  headers: Record<string,string>,
  body: object,
  retryTruncatedGroqOutput = false
): Promise<any> {
  let requestBody = body;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.LLM_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method:'POST', headers: { 'content-type':'application/json', ...headers },
        body: JSON.stringify(requestBody), signal: controller.signal
      });
      if (!res.ok) {
        const rejectionBody = [400,404,422].includes(res.status)
          ? await res.text().catch(() => '')
          : '';

        if (retryTruncatedGroqOutput && attempt === 0
          && truncatedStructuredOutput(res.status, rejectionBody)) {
          const previous = Number((requestBody as Record<string,unknown>).max_completion_tokens);
          const next = Math.min(previous * 2, MAX_GROQ_COMPLETION_TOKENS);
          if (Number.isFinite(previous) && next > previous) {
            requestBody = { ...requestBody, max_completion_tokens: next };
            if (config.NODE_ENV === 'development') {
              console.warn(JSON.stringify({
                event: 'llm_provider_retry', provider: 'groq',
                reason: 'truncated_structured_output', max_completion_tokens: next
              }));
            }
            continue;
          }
        }

        if ([400,404,422].includes(res.status)) {
          logProviderRejection(res.status, rejectionBody);
        }
        if (attempt === 0 && [429,502,503,504].includes(res.status)) {
          const retryAfter = Number(res.headers.get('retry-after') || 0);
          if (res.status !== 429 || (!retryAfter || retryAfter <= 2)) {
            const delayMs = retryAfter > 0 ? Math.min(2000,retryAfter * 1000) : 500;
            await new Promise(resolve => setTimeout(resolve,delayMs));
            continue;
          }
        }
        throw mapHttpError(res.status);
      }
      const length = Number(res.headers.get('content-length') || 0);
      if (length > 250000) throw new AppError('LLM_OUTPUT_INVALID',502,'Resposta do modelo excedeu o limite.');
      const raw = await res.text();
      if (raw.length > 250000) throw new AppError('LLM_OUTPUT_INVALID',502,'Resposta do modelo excedeu o limite.');
      try { return JSON.parse(raw); }
      catch { throw new AppError('LLM_OUTPUT_INVALID',502,'Resposta do modelo não é JSON.'); }
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (controller.signal.aborted) throw new AppError('LLM_TIMEOUT',504,'Tempo limite de resposta da IA excedido.');
      throw new AppError('LLM_UNAVAILABLE',503,'Não foi possível conectar ao provedor da IA.');
    } finally { clearTimeout(timer); }
  }
  throw new AppError('LLM_UNAVAILABLE',503,'Provedor indisponível.');
}

function parseModelText(text: unknown): unknown {
  if (typeof text !== 'string') throw new AppError('LLM_OUTPUT_INVALID',502,'Modelo não retornou conteúdo textual.');
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try { return JSON.parse(trimmed); }
  catch { throw new AppError('LLM_OUTPUT_INVALID',502,'Modelo retornou estrutura JSON inválida.'); }
}

export async function generateDiagnosis(userPrompt: string): Promise<unknown> {
  const info = getProviderInfo();
  if (!info.configured) throw new AppError('LLM_NOT_CONFIGURED',503,'Configure a chave do provedor no backend/.env.');

  if (info.provider === 'groq') {
    const reasoning = /^openai\/gpt-oss-(20b|120b)$/.test(info.model)
      ? { reasoning_effort: 'low' as const }
      : {};
    const result = await requestJson('https://api.groq.com/openai/v1/chat/completions',
      { authorization: `Bearer ${config.GROQ_API_KEY}` }, {
        model: info.model, temperature: 0.1,
        max_completion_tokens: config.GROQ_MAX_COMPLETION_TOKENS,
        ...reasoning,
        messages: [ {role:'system',content:SYSTEM_PROMPT},{role:'user',content:userPrompt} ],
        response_format: {type:'json_schema', json_schema:{name:'diagnostic_result',strict:true,schema:outputJsonSchema}}
      }, true);
    return parseModelText(result?.choices?.[0]?.message?.content);
  }

  if (info.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(info.model)}:generateContent`;
    const result = await requestJson(url, {'x-goog-api-key': config.GEMINI_API_KEY}, {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{role:'user',parts:[{text:userPrompt}]}],
      generationConfig: { responseMimeType:'application/json', temperature:0.1, maxOutputTokens:1300 }
    });
    const text = result?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text ?? '').join('');
    return parseModelText(text);
  }

  const endpoint = new URL('/api/chat',config.OLLAMA_URL).toString();
  const result = await requestJson(endpoint, {}, {
    model: info.model, stream:false, format:outputJsonSchema,
    messages: [{role:'system',content:SYSTEM_PROMPT},{role:'user',content:userPrompt}],
    options: {temperature:0.1,num_predict:1300}, keep_alive:'30s'
  });
  return parseModelText(result?.message?.content);
}
