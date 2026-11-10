import { AppError } from '../core/errors.js';
import { validateDiagnosis } from './validate.js';

const correction = '\n\nA resposta anterior continha números não comprovados. ' +
  'Reescreva as passagens com linguagem qualitativa ou utilize apenas valores, ' +
  'códigos HTTP e unidades presentes literalmente nas métricas e evidências. ' +
  'Não faça estimativas nem novos cálculos.';

export async function generateValidatedDiagnosis(
  prompt: string,
  evidenceIds: string[],
  trustedSources: string[],
  generate: (input: string) => Promise<unknown>
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await generate(prompt + (attempt === 0 ? '' : correction));
    try {
      return validateDiagnosis(response, evidenceIds, trustedSources);
    } catch (error) {
      // A única falha recuperável é uma alegação numérica não comprovada.
      if (!(error instanceof AppError) || error.code !== 'LLM_NUMERIC_CLAIM' || attempt > 0) {
        throw error;
      }
    }
  }

  throw new AppError('LLM_OUTPUT_INVALID', 502, 'Não foi possível validar o diagnóstico.');
}
