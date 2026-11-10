import { describe,it,expect } from 'vitest';
import { ingestBatch } from '../core/validation.js';

const batch = {project_slug:'api-platform-demo',service_code:'payment-connector',events:[{
  event_uid:'unit-01',observed_at:'2026-11-04T10:00:00Z',level:'ERROR',success:false,
  http_status:429,duration_ms:120,error_code:'RATE_LIMIT'
}]};

describe('ingestBatch',() => {
  it('accepts a valid event',() => expect(ingestBatch.safeParse(batch).success).toBe(true));
  it('rejects unknown attributes',() => expect(ingestBatch.safeParse({...batch,admin:true}).success).toBe(false));
  it('rejects invalid HTTP status',() => expect(ingestBatch.safeParse({...batch,events:[{...batch.events[0],http_status:900}]}).success).toBe(false));
  it('rejects inconsistent success and HTTP status',() => expect(ingestBatch.safeParse({...batch,events:[{...batch.events[0],success:true}]}).success).toBe(false));
  it('limits batch size',() => expect(ingestBatch.safeParse({...batch,events:Array(201).fill(batch.events[0])}).success).toBe(false));
});
