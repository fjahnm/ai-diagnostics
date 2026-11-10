import { describe, expect, it, vi } from 'vitest';
import { generateValidatedDiagnosis } from '../ai/generate-validated.js';

const valid = {
  resumo: 'Existem falhas recorrentes no serviço monitorado.',
  gravidade: 'media',
  hipoteses: [{
    descricao: 'Pode existir restrição por limite de requisições.',
    confianca: 'media',
    evidencias: ['EV-429'],
    recomendacao: 'Investigar os limites definidos para o cliente.'
  }],
  limitacoes: ['Não foi possível confirmar a causa raiz com os dados disponíveis.']
};

const unsupported = { ...valid, resumo: 'Ocorreram 999 falhas no período observado.' };
const sources = ['13 execuções retornaram HTTP 429.'];

describe('Validated LLM output', () => {
  it('accepts a valid result without repeating the request', async () => {
    const generate = vi.fn().mockResolvedValue(valid);
    await expect(generateValidatedDiagnosis('Dados técnicos', ['EV-429'], sources, generate))
      .resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('makes one corrective request for unsupported numeric claims', async () => {
    const generate = vi.fn().mockResolvedValueOnce(unsupported).mockResolvedValueOnce(valid);
    await expect(generateValidatedDiagnosis('Dados técnicos', ['EV-429'], sources, generate))
      .resolves.toEqual(valid);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toContain('números não comprovados');
  });

  it('never accepts unsupported numbers after the retry', async () => {
    const generate = vi.fn().mockResolvedValue(unsupported);
    await expect(generateValidatedDiagnosis('Dados técnicos', ['EV-429'], sources, generate))
      .rejects.toMatchObject({ code: 'LLM_NUMERIC_CLAIM' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry invalid references to evidence', async () => {
    const generate = vi.fn().mockResolvedValue({
      ...valid, hipoteses: [{ ...valid.hipoteses[0], evidencias: ['EV-UNKNOWN'] }]
    });
    await expect(generateValidatedDiagnosis('Dados técnicos', ['EV-429'], sources, generate))
      .rejects.toMatchObject({ code: 'LLM_EVIDENCE_INVALID' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
