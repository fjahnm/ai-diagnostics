export const outputJsonSchema = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    gravidade: { type: 'string', enum: ['baixa','media','alta'] },
    hipoteses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          descricao: { type: 'string' },
          confianca: { type: 'string', enum: ['baixa','media','alta'] },
          evidencias: { type: 'array', items: { type: 'string' } },
          recomendacao: { type: 'string' }
        },
        required: ['descricao','confianca','evidencias','recomendacao'],
        additionalProperties: false
      }
    },
    limitacoes: { type: 'array', items: { type: 'string' } }
  },
  required: ['resumo','gravidade','hipoteses','limitacoes'],
  additionalProperties: false
} as const;
