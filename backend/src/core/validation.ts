import { z } from 'zod';

export const positiveId = z.coerce.number().int().positive().safe();
export const periodDays = z.coerce.number().int().refine(v => [7, 14, 30].includes(v)).default(14);
export const pageNumber = z.coerce.number().int().min(1).max(100000).default(1);

export const ingestEvent = z.object({
  event_uid: z.string().trim().min(1).max(96),
  observed_at: z.string().datetime({ offset: true }),
  level: z.enum(['INFO', 'WARN', 'ERROR']),
  success: z.boolean(),
  http_status: z.number().int().min(100).max(599).nullable(),
  duration_ms: z.number().int().min(0).max(600000),
  error_code: z.string().trim().max(70).nullable().optional(),
  message: z.string().trim().max(280).nullable().optional()
}).strict().refine(event => event.http_status === null || event.success === (event.http_status < 400), {
  message: 'success e http_status devem indicar o mesmo resultado.'
});

export const ingestBatch = z.object({
  project_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  service_code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  events: z.array(ingestEvent).min(1).max(200)
}).strict();

export const diagnosticSchema = z.object({
  resumo: z.string().trim().min(12).max(600),
  gravidade: z.enum(['baixa', 'media', 'alta']),
  hipoteses: z.array(z.object({
    descricao: z.string().trim().min(8).max(360),
    confianca: z.enum(['baixa', 'media', 'alta']),
    evidencias: z.array(z.string().max(30)).max(6),
    recomendacao: z.string().trim().min(8).max(360)
  }).strict()).max(5),
  limitacoes: z.array(z.string().trim().min(8).max(300)).max(5)
}).strict();

export type DiagnosticResult = z.infer<typeof diagnosticSchema>;
export type IngestBatch = z.infer<typeof ingestBatch>;

export const createProjectSchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(300).optional()
}).strict();

export const createServiceSchema = z.object({
  project_slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  code: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  name: z.string().trim().min(2).max(140),
  type: z.enum(['REST_API','INTEGRATION','BACKGROUND_JOB'])
}).strict();
