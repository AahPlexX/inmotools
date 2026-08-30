import { describe, expect, it } from 'vitest';
import { buildSpanTree, computeCriticalPath, parseTraceExport } from '../../src/tools/otel/otel-engine';

const otlp = {
  resourceSpans: [
    {
      resource: { attributes: [{ key: 'service.name', value: { stringValue: 'checkout-api' } }] },
      scopeSpans: [
        {
          scope: { name: 'fixture' },
          spans: [
            {
              traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              spanId: '1111111111111111',
              name: 'POST /checkout',
              startTimeUnixNano: '1788024000000000000',
              endTimeUnixNano: '1788024000100000000',
              attributes: [{ key: 'http.response.status_code', value: { intValue: '200' } }],
              status: { code: 1 },
            },
            {
              traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
              spanId: '2222222222222222',
              parentSpanId: '1111111111111111',
              name: 'charge card',
              startTimeUnixNano: '1788024000020000000',
              endTimeUnixNano: '1788024000090000000',
              attributes: [
                { key: 'error.type', value: { stringValue: 'payment_declined' } },
                { key: 'exception.message', value: { stringValue: 'declined' } },
              ],
              status: { code: 2, message: 'Error' },
            },
          ],
        },
      ],
    },
  ],
};

const jaeger = {
  data: [
    {
      traceID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      processes: { p1: { serviceName: 'inventory-api', tags: [] } },
      spans: [
        {
          traceID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          spanID: '3333333333333333',
          operationName: 'reserve stock',
          references: [],
          startTime: 1788024000000000,
          duration: 120000,
          processID: 'p1',
          tags: [{ key: 'http.status_code', type: 'int64', value: 200 }],
          logs: [],
        },
      ],
    },
  ],
};

describe('OpenTelemetry trace normalization', () => {
  it('normalizes OTLP JSON spans, service metadata, timing, hierarchy, and error state', () => {
    const trace = parseTraceExport(otlp);
    expect(trace.spans).toHaveLength(2);
    expect(trace.spans[0]).toMatchObject({
      traceId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      spanId: '1111111111111111',
      serviceName: 'checkout-api',
      startMs: 0,
      durationMs: 100,
      error: false,
    });
    expect(trace.spans[1]).toMatchObject({ parentSpanId: '1111111111111111', durationMs: 70, error: true });
    const tree = buildSpanTree(trace.spans);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((child) => child.span.spanId)).toEqual(['2222222222222222']);
    expect(computeCriticalPath(trace.spans)).toEqual(['1111111111111111', '2222222222222222']);
  });

  it('accepts Jaeger JSON and safely handles an orphaned parent reference', () => {
    const trace = parseTraceExport(jaeger);
    expect(trace.spans).toHaveLength(1);
    expect(trace.spans[0]).toMatchObject({ serviceName: 'inventory-api', durationMs: 120 });
    const orphan = { ...trace.spans[0], spanId: '4444444444444444', parentSpanId: 'missing-parent' };
    expect(buildSpanTree([orphan])).toHaveLength(1);
  });
});
