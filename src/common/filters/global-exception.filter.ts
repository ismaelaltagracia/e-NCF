import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';
import { ErrorResponse } from '../interfaces/error-response.interface.js';
import { getCorrelationId } from '../interceptors/correlation-id.interceptor.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const correlationId = getCorrelationId();
    const timestamp = new Date().toISOString();

    let errorResponse: ErrorResponse;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string }).message ?? exception.message);

      errorResponse = {
        statusCode: status,
        message: typeof message === 'string' ? message : JSON.stringify(message),
        error: HttpStatus[status] ?? 'Error',
        correlationId,
        timestamp,
      };
    } else if (exception instanceof ZodError) {
      const details = exception.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));

      errorResponse = {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Validation failed',
        error: 'Bad Request',
        correlationId,
        details,
        timestamp,
      };
    } else {
      errorResponse = {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'Internal server error',
        error: 'Internal Server Error',
        correlationId,
        timestamp,
      };

      const errorMessage = exception instanceof Error ? exception.stack : String(exception);

      this.logger.error(
        JSON.stringify({
          timestamp,
          level: 'error',
          message: 'Unhandled exception',
          correlation_id: correlationId,
          context: 'ExceptionFilter',
          error: errorMessage,
        }),
      );
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }
}
