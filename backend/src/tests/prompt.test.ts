import { describe, expect, it } from 'vitest';
import { createPrompt } from '../ai/prompt.js';
import type { getMetrics } from '../services/metrics.service.js';

const metrics: Awaited<ReturnType<typeof getMetrics>> = {
  days: 14, total: 8, succeeded: 7, failed: 1, success_rate: 87.5,
  avg_duration_ms: 220, error_distribution: [{code: 500, count: 1}], timeline: [],
  windows: { recent_total: 4, recent_failed: 1, previous_total: 4, previous_failed: 0 }
};

describe('LLM context minimization', () => {
  it('includes metrics but never leaks project or service names', () => {
    const prompt = createPrompt({
      name: 'Private Client Name',
      project_name: 'Restricted Business Unit',
      type: 'REST_API'
    }, metrics, []);
    const context = JSON.parse(prompt.slice(prompt.indexOf('\n\n') + 2));
    expect(context.service).toEqual({type: 'REST_API'});
    expect(context.metrics.failed).toBe(1);
    expect(prompt).not.toContain('Private Client Name');
    expect(prompt).not.toContain('Restricted Business Unit');
  });
});
