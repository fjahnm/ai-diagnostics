import { describe,it,expect } from 'vitest';
import { numericSources, validateDiagnosis } from '../ai/validate.js';

const result = {resumo:'As execuções exibem falhas recorrentes na comunicação.',gravidade:'media',
  hipoteses:[{descricao:'Possível limitação por taxa de requisições.',confianca:'media',
    evidencias:['EV-429'],recomendacao:'Investigar cabeçalhos e limites de uso.'}],
  limitacoes:['Não foi possível confirmar a configuração do provedor.']};

describe('validateDiagnosis',() => {
  it('accepts claims with real evidence',() => expect(validateDiagnosis(result,['EV-429'])).toEqual(result));
  it('rejects invented evidence references',() => expect(()=>validateDiagnosis(result,['EV-BASE'])).toThrow());
  it('rejects invented fields',() => expect(()=>validateDiagnosis({...result,probability:99},['EV-429'])).toThrow());
});


describe('Numeric claims grounded in evidence', () => {
  const sources = [
    'Foram registradas 48 execuções, sendo 20 falhas no período.',
    '13 execuções retornaram HTTP 429.',
    '7 execuções retornaram códigos HTTP da família 5xx.',
    'Taxa de falhas nas últimas 24h: 75%; nas 24h anteriores: 8.33%.'
  ];

  it('accepts HTTP codes, percentages and counts present in trusted sources', () => {
    const diagnosis = {
      ...result,
      resumo: 'O serviço registrou 20 falhas, incluindo 13 respostas HTTP 429.',
      hipoteses: [{ ...result.hipoteses[0], descricao: 'Ocorreu degradação com 75% de falhas e erros da família 5xx.' }]
    };
    expect(validateDiagnosis(diagnosis, ['EV-429'], sources)).toEqual(diagnosis);
  });

  it('accepts comma or period for the same verified decimal', () => {
    const diagnosis = { ...result, resumo: 'A taxa anterior foi de 8,33% e passou para 75%.' };
    expect(validateDiagnosis(diagnosis, ['EV-429'], sources)).toEqual(diagnosis);
  });

  it('rejects a number that is not present in the trusted sources', () => {
    const diagnosis = { ...result, resumo: 'Foram registradas 999 falhas no período analisado.' };
    expect(() => validateDiagnosis(diagnosis, ['EV-429'], sources)).toThrowError(
      'O diagnóstico contém números não encontrados nas métricas ou evidências.'
    );
  });

  it('does not confuse counts and percentages', () => {
    const diagnosis = { ...result, resumo: 'O serviço apresentou uma taxa de falhas de 13%.' };
    expect(() => validateDiagnosis(diagnosis, ['EV-429'], sources)).toThrow();
  });

  it('builds trusted sources from the same calculated metrics and evidences', () => {
    const sources = numericSources({
      days: 14, total: 48, succeeded: 28, failed: 20,
      success_rate: 58.33, avg_duration_ms: 598,
      error_distribution: [{ code: 429, count: 13 }], timeline: [],
      windows: { recent_total: 24, recent_failed: 18, previous_total: 24, previous_failed: 2 }
    }, [{ id: 'EV-429', type: 'RATE_LIMIT',
      description: '13 execuções retornaram HTTP 429.', values: { count: 13 } }]);
    expect(sources).toContain('58.33% de sucesso');
    expect(sources).toContain('598 ms de duração média');
    expect(sources).toContain('HTTP 429: 13 ocorrências');
  });
});
