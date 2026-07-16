import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { z, ZodError } from 'zod';
import { GlobalExceptionFilter } from './global-exception.filter';

function createMockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/test', method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  it('should handle HttpException with proper status code and message', () => {
    const { host, status, json } = createMockHost();
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Not Found',
        error: 'NOT_FOUND',
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle ZodError with validation details', () => {
    const { host, status, json } = createMockHost();
    const schema = z.object({ email: z.string().email() });
    const result = schema.safeParse({ email: 123 });
    const zodError = (result as { error: ZodError }).error;

    filter.catch(zodError, host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details: expect.arrayContaining([
          expect.objectContaining({
            path: 'email',
            message: expect.any(String),
          }),
        ]),
        timestamp: expect.any(String),
      }),
    );
  });

  it('should handle unknown errors as 500 Internal Server Error', () => {
    const { host, status, json } = createMockHost();
    const exception = new Error('Something broke');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        error: 'Internal Server Error',
        timestamp: expect.any(String),
      }),
    );
  });

  it('should include correlationId in the response when available', () => {
    const { host, json } = createMockHost();
    const exception = new HttpException('Bad', 400);

    filter.catch(exception, host);

    const response = json.mock.calls[0][0];
    expect(response).toHaveProperty('correlationId');
  });
});
