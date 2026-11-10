import { describe, expect, it } from 'vitest';
import { buildDemoScenarios, DEMO_PROJECT } from '../demo/scenarios.js';
import { ingestEvent } from '../core/validation.js';
import { detectAnomalies } from '../services/anomalies.service.js';

const reference = new Date('2026-11-06T18:00:00.000Z');

function toMetrics(events: ReturnType<typeof buildDemoScenarios>[number]['events']) {
  const recent = events.filter(e => reference.getTime() - new Date(e.observed_at).getTime() < 24*60*60*1000);
  const previous = events.filter(e => reference.getTime() - new Date(e.observed_at).getTime() >= 24*60*60*1000);
  const errors = new Map<number,number>();
  for (const event of events.filter(e => !e.success)) errors.set(event.http_status ?? 0,(errors.get(event.http_status ?? 0) ?? 0)+1);
  return {
    days: 14, total:events.length, succeeded:events.filter(e=>e.success).length,
    failed:events.filter(e=>!e.success).length,
    success_rate:events.filter(e=>e.success).length/events.length*100,
    avg_duration_ms:Math.round(events.reduce((a,e)=>a+e.duration_ms,0)/events.length),
    error_distribution:Array.from(errors.entries()).map(([code,count])=>({code,count})),
    timeline: [], windows: {
      recent_total:recent.length,recent_failed:recent.filter(e=>!e.success).length,
      previous_total:previous.length,previous_failed:previous.filter(e=>!e.success).length
    }
  };
}

describe('Reproducible demo', () => {
  it('isolates synthetic data in a reserved project', () => {
    expect(DEMO_PROJECT.slug).toBe('ai-diagnostics-showcase');
    expect(buildDemoScenarios(reference)).toEqual(buildDemoScenarios(reference));
  });

  it('produces valid, synthetic, time-bounded events', () => {
    const scenarios=buildDemoScenarios(reference);
    expect(scenarios).toHaveLength(4);
    for (const scenario of scenarios) {
      expect(scenario.events).toHaveLength(scenario.expected.total);
      expect(scenario.events.filter(e=>!e.success)).toHaveLength(scenario.expected.failed);
      expect(new Set(scenario.events.map(e=>e.event_uid)).size).toBe(scenario.events.length);
      for (const event of scenario.events) {
        expect(ingestEvent.safeParse(event).success).toBe(true);
        expect(new Date(event.observed_at).getTime()).toBeGreaterThan(reference.getTime()-48*60*60*1000);
        expect(new Date(event.observed_at).getTime()).toBeLessThan(reference.getTime());
        expect(event.message).toBeNull();
      }
      expect(detectAnomalies(toMetrics(scenario.events)).map(e=>e.id)).toEqual(scenario.expected.evidence);
    }
  });
});
