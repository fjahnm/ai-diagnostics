import { describe,it,expect } from 'vitest';
import { detectAnomalies, getSeverity } from '../services/anomalies.service.js';

describe('detectAnomalies',() => {
  it('does not fabricate evidence for zero executions',() => {
    const metrics = {days:14,total:0,succeeded:0,failed:0,success_rate:null,
      avg_duration_ms:null,error_distribution:[],timeline:[],windows:{recent_total:0,recent_failed:0,previous_total:0,previous_failed:0}};
    expect(detectAnomalies(metrics)).toEqual([]);
  });
  it('references only observed HTTP statuses',() => {
    const metrics = {days:14,total:100,succeeded:75,failed:25,success_rate:75,
      avg_duration_ms:80,error_distribution:[{code:429,count:18},{code:500,count:7}],timeline:[],
      windows:{recent_total:10,recent_failed:3,previous_total:10,previous_failed:1}};
    expect(detectAnomalies(metrics).map(x=>x.id)).toEqual(['EV-BASE','EV-429','EV-5XX','EV-TREND']);
    expect(detectAnomalies(metrics).find(x=>x.id==='EV-429')?.values.count).toBe(18);
    expect(getSeverity(metrics)).toBe('alta');
  });
});
