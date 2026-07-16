import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, lastValueFrom } from 'rxjs';
import { CorrelationIdInterceptor, getCorrelationId } from './correlation-id.interceptor';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createMockContext(headers: Record<string, string | undefined> = {}) {
  const request = { headers, correlationId: '' };
  const response = { setHeader: jest.fn() };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request, response };
}

function createMockCallHandler(returnValue: unknown = 'result'): CallHandler {
  return { handle: () => of(returnValue) };
}

describe('CorrelationIdInterceptor', () => {
  let interceptor: CorrelationIdInterceptor;

  beforeEach(() => {
    interceptor = new CorrelationIdInterceptor();
  });

  it('should generate a UUID v4 correlation ID when none is provided', async () => {
    const { context, request, response } = createMockContext();
    const handler = createMockCallHandler();

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(request.correlationId).toMatch(UUID_V4_REGEX);
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      expect.stringMatching(UUID_V4_REGEX),
    );
  });

  it('should use the incoming X-Correlation-ID header if it is a valid UUID v4', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const { context, request, response } = createMockContext({
      'x-correlation-id': validUuid,
    });
    const handler = createMockCallHandler();

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(request.correlationId).toBe(validUuid);
    expect(response.setHeader).toHaveBeenCalledWith('x-correlation-id', validUuid);
  });

  it('should generate a new UUID if the provided header is not a valid UUID v4', async () => {
    const { context, request, response } = createMockContext({
      'x-correlation-id': 'not-a-valid-uuid',
    });
    const handler = createMockCallHandler();

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(request.correlationId).toMatch(UUID_V4_REGEX);
    expect(request.correlationId).not.toBe('not-a-valid-uuid');
    expect(response.setHeader).toHaveBeenCalledWith(
      'x-correlation-id',
      expect.stringMatching(UUID_V4_REGEX),
    );
  });

  it('should make correlation ID available via getCorrelationId() during request lifecycle', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const { context } = createMockContext({
      'x-correlation-id': validUuid,
    });

    let capturedId: string | undefined;
    const handler: CallHandler = {
      handle: () => {
        capturedId = getCorrelationId();
        return of('done');
      },
    };

    await lastValueFrom(interceptor.intercept(context, handler));

    expect(capturedId).toBe(validUuid);
  });
});
