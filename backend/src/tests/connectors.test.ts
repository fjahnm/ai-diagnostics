import { describe, expect, it } from 'vitest';
import { mapRemoteRecord, readField } from '../connectors/mapper.js';
import { connectorInputSchema } from '../connectors/schema.js';

const mapping = {
  event_uid:'pklog',observed_at:'created_at',success:'success',http_status:'status',
  duration_ms:'elapsed',error_code:'error.code',message:''
};

describe('Generic JSON connector', () => {
  it('reads a nested JSON path without executing code', () => {
    expect(readField({data:{items:[{id:2}]}},'data.items.0.id')).toBe(2);
    expect(readField({data:{}},'data.missing')).toBeUndefined();
    expect(connectorInputSchema.safeParse({service_id:1,name:'Test',endpoint_url:'https://example.org',mode:'JSON_LOGS',records_path:'__proto__',field_mapping:mapping,auth_type:'NONE',auth_header:null,pagination_mode:'NONE',page_parameter:'page',page_start:1,max_pages:1,page_size_parameter:null,page_size:100,enabled:true}).success).toBe(false);
  });

  it('normalizes events and provides deterministic deduplication', () => {
    const data = {pklog:500,created_at:'2026-11-04T12:00:00Z',success:false,status:429,elapsed:380,error:{code:'RATE_LIMIT'}};
    const first = mapRemoteRecord(data,mapping,5);
    const again = mapRemoteRecord(data,mapping,5);
    const otherConnector = mapRemoteRecord(data,mapping,6);
    expect(first?.event_uid).toBe(again?.event_uid);
    expect(first?.event_uid).not.toBe(otherConnector?.event_uid);
    expect(first?.http_status).toBe(429);
    expect(first?.error_code).toBe('RATE_LIMIT');
  });

  it('rejects incompatible, missing or fabricated metric values', () => {
    expect(mapRemoteRecord({pklog:1,created_at:'invalid',success:false,status:429,elapsed:20},mapping,5)).toBeNull();
    expect(mapRemoteRecord({pklog:1,created_at:'2026-11-04T12:00:00Z',success:false,status:200,elapsed:20},mapping,5)).toBeNull();
    expect(mapRemoteRecord({pklog:1,created_at:'2026-11-04T12:00:00Z',success:false,status:429},mapping,5)).toBeNull();
  });
});
