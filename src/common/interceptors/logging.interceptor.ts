import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { getCorrelationId } from './correlation-id.interceptor.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const { method, url } = request;
    const startTime = Date.now();

    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `${method} ${url}`,
      correlation_id: getCorrelationId(),
      context: 'HTTP',
    };

    this.logger.log(JSON.stringify(logEntry));

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const responseLog = {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: `${method} ${url} completed`,
            correlation_id: getCorrelationId(),
            context: 'HTTP',
            duration_ms: duration,
            status: context.switchToHttp().getResponse<{ statusCode: number }>().statusCode,
          };
          this.logger.log(JSON.stringify(responseLog));
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          const statusCode =
            error instanceof Object && 'getStatus' in error
              ? (error as { getStatus: () => number }).getStatus()
              : 500;
          const errorLog = {
            timestamp: new Date().toISOString(),
            level: 'error',
            message: `${method} ${url} failed`,
            correlation_id: getCorrelationId(),
            context: 'HTTP',
            duration_ms: duration,
            status: statusCode,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          this.logger.error(JSON.stringify(errorLog));
        },
      }),
    );
  }
}
