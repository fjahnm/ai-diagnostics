import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  config: {
    NODE_ENV: 'development', LLM_PROVIDER: 'groq', GROQ_API_KEY: 'synthetic-test-key', GROQ_MODEL: 'openai/gpt-oss-20b', GROQ_MAX_COMPLETION_TOKENS: 4096,
    LLM_TIMEOUT_MS: 2000, GEMINI_API_KEY: '', GEMINI_MODEL: '',
    OLLAMA_URL: 'http://127.0.0.1:11434', OLLAMA_MODEL: 'llama3.2:3b'
  }
}));

import { generateDiagnosis } from '../ai/provider.js';

afterEach(() => vi.unstubAllGlobals());

describe('AI transport', () => {
  it('submits a real Groq-style request and parses JSON result', async () => {
    const output = {resumo:'O serviço registra falhas recorrentes de integração.',gravidade:'media',
      hipoteses:[],limitacoes:['Não é possível determinar a causa exata dos problemas.']};
    const mock = vi.fn(async () => new Response(JSON.stringify({
      choices:[{message:{content:JSON.stringify(output)}}]
    }),{status:200,headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',mock);
    expect(await generateDiagnosis('Dados de exemplo')).toEqual(output);
    const args = mock.mock.calls[0] as unknown as [string,RequestInit];
    expect(args[0]).toContain('api.groq.com');
    const request = JSON.parse(String(args[1].body));
    expect(request.response_format.type).toBe('json_schema');
    expect(request.response_format.json_schema.strict).toBe(true);
    expect(request.max_completion_tokens).toBe(4096);
    expect(request.reasoning_effort).toBe('low');
  });

  it('logs sanitized upstream 400 details in development', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: {
        message: 'Invalid response_format parameter',
        type: 'invalid_request_error',
        param: 'response_format',
        code: 'invalid_parameter'
      }
    }), { status: 400 })));

    try {
      await expect(generateDiagnosis('Dados sintéticos')).rejects.toMatchObject({ code: 'LLM_HTTP_ERROR' });
      const details = log.mock.calls.map(args => String(args[0])).join('\n');
      expect(details).toContain('llm_provider_rejection');
      expect(details).toContain('response_format');
      expect(details).not.toContain('synthetic-test-key');
    } finally {
      log.mockRestore();
    }
  });

  it('retries a truncated structured document once with a larger token budget', async () => {
    const output = {
      resumo: 'As evidências apontam para falhas recorrentes.', gravidade: 'alta',
      hipoteses: [], limitacoes: ['Não há informações suficientes para confirmar a causa.']
    };
    const mock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          code: 'json_validate_failed', type: 'invalid_request_error',
          message: "max completion tokens reached before generating a valid document: the output was truncated to fit max_completion_tokens and is missing required content."
        }
      }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }]
      }), { status: 200 }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', mock);
    try {
      await expect(generateDiagnosis('Métricas verificadas')).resolves.toEqual(output);
      expect(mock).toHaveBeenCalledTimes(2);
      const first = JSON.parse(String((mock.mock.calls[0] as [string, RequestInit])[1].body));
      const second = JSON.parse(String((mock.mock.calls[1] as [string, RequestInit])[1].body));
      expect(first.max_completion_tokens).toBe(4096);
      expect(second.max_completion_tokens).toBe(8192);
      expect(second.response_format.json_schema.strict).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it('does not retry a 400 response unrelated to output truncation', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'json_validate_failed', type: 'invalid_request_error',
        message: 'Generated document does not match schema for another reason.'
      }
    }), { status: 400 }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', mock);
    try {
      await expect(generateDiagnosis('Métricas verificadas')).rejects.toMatchObject({ code: 'LLM_HTTP_ERROR' });
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });

  it('stops after one retry when both generations are truncated', async () => {
    const mock = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'json_validate_failed', type: 'invalid_request_error',
        message: 'max completion tokens reached; output was truncated to fit max_completion_tokens'
      }
    }), { status: 400 }));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', mock);
    try {
      await expect(generateDiagnosis('Métricas verificadas')).rejects.toMatchObject({ code: 'LLM_HTTP_ERROR' });
      expect(mock).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });

  it('returns a typed failure on invalid credentials', async () => {
    vi.stubGlobal('fetch',vi.fn(async () => new Response('{}',{status:401})));
    await expect(generateDiagnosis('Dados de exemplo')).rejects.toMatchObject({code:'LLM_AUTH_ERROR'});
  });
});
