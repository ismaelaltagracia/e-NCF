import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request, Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const correlationStorage = new AsyncLocalStorage<string>();

export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore();
}

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();
    const response = httpContext.getResponse<Response>();

    const headerValue = request.headers[CORRELATION_ID_HEADER];
    const incomingId = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    const correlationId = incomingId && UUID_V4_REGEX.test(incomingId) ? incomingId : randomUUID();

    (request as Request & { correlationId: string }).correlationId = correlationId;

    response.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Envolvemos la SUSCRIPCIÓN (no solo la construcción) dentro del contexto de
    // AsyncLocalStorage, para que el correlationId esté disponible durante toda la
    // ejecución asíncrona del handler y en los interceptores posteriores (logging).
    //
    // Importante: hay UNA sola suscripción al stream de Nest y se devuelve ese mismo
    // Observable. Antes se hacía un .subscribe() interno adicional sin handler de
    // error, lo que duplicaba el stream y provocaba que los errores (p. ej.
    // UnauthorizedException en el login) quedaran como "unhandled" en rxjs
    // (reportUnhandledError), ensuciando los logs e incluso pudiendo tumbar el proceso.
    return new Observable((subscriber) => {
      return correlationStorage.run(correlationId, () => next.handle().subscribe(subscriber));
    });
  }
}
