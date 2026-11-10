import { z } from 'zod';

function validPath(value: string) {
  return !value || value.split('.').every(part => /^[A-Za-z0-9_-]+$/.test(part)
    && !['__proto__', 'constructor', 'prototype'].includes(part));
}
const path = z.string().trim().max(160).refine(validPath, 'Caminho inválido.');
const requiredPath = z.string().trim().min(1).max(160).refine(validPath, 'Caminho inválido.');

export const mappingSchema = z.object({
  event_uid: path,
  observed_at: requiredPath,
  success: path,
  http_status: path,
  duration_ms: requiredPath,
  error_code: path,
  message: path
}).strict();

export const connectorInputSchema = z.object({
  service_id: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  endpoint_url: z.string().trim().url().max(2048).refine(url => /^https?:\/\//i.test(url), 'Apenas URLs HTTP ou HTTPS.'),
  mode: z.enum(['JSON_LOGS','HTTP_CHECK']),
  records_path: path,
  field_mapping: mappingSchema,
  auth_type: z.enum(['NONE', 'BEARER', 'API_KEY']),
  auth_header: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/).nullable(),
  auth_secret: z.string().max(4096).optional(),
  pagination_mode: z.enum(['NONE', 'PAGE']),
  page_parameter: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/),
  page_start: z.number().int().min(0).max(1000),
  max_pages: z.number().int().min(1).max(5),
  page_size_parameter: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,47}$/).nullable(),
  page_size: z.number().int().min(1).max(200),
  enabled: z.boolean()
}).strict().superRefine((input, ctx) => {
  if (input.auth_type === 'API_KEY' && (!input.auth_header || /^(host|cookie|content-length|proxy-authorization)$/i.test(input.auth_header))) {
    ctx.addIssue({ code: 'custom', path: ['auth_header'], message: 'Informe um cabeçalho de autenticação válido.' });
  }
  if (input.auth_type === 'BEARER' && input.auth_header) {
    ctx.addIssue({ code: 'custom', path: ['auth_header'], message: 'Bearer utiliza o cabeçalho Authorization.' });
  }
});

export type ConnectorInput = z.infer<typeof connectorInputSchema>;
export type FieldMapping = z.infer<typeof mappingSchema>;
