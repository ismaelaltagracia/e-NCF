import { Controller, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard.js';

/**
 * Endpoint para consultar el estado de conexión con la DGII.
 * Usado por el frontend para mostrar el indicador de contingencia.
 */
@ApiTags('DGII')
@Controller('api/v1/dgii')
@UseGuards(JwtAuthGuard)
export class DgiiStatusController {
  constructor(private readonly circuitBreaker: CircuitBreakerService) {}

  /**
   * GET /api/v1/dgii/estado-conexion
   * Retorna el estado actual de la conexión con DGII.
   *
   * Respuestas:
   * - estado: "conectado" | "contingencia" | "verificando"
   * - detalles del circuit breaker para información
   */
  @Get('estado-conexion')
  @HttpCode(HttpStatus.OK)
  getEstadoConexion() {
    const cbState = this.circuitBreaker.getState();
    const timeToHalfOpen = this.circuitBreaker.getTimeToHalfOpen();

    let estado: 'conectado' | 'contingencia' | 'verificando';
    let mensaje: string;

    switch (cbState) {
      case 'CLOSED':
        estado = 'conectado';
        mensaje = 'Conexión con DGII operativa. Las facturas se transmiten en tiempo real.';
        break;
      case 'OPEN':
        estado = 'contingencia';
        mensaje = 'DGII temporalmente no disponible. Las facturas se emiten y se transmitirán automáticamente cuando se restablezca la conexión.';
        break;
      case 'HALF-OPEN':
        estado = 'verificando';
        mensaje = 'Verificando reconexión con DGII. La próxima factura servirá como prueba de conectividad.';
        break;
    }

    return {
      estado,
      mensaje,
      circuit_breaker: cbState,
      tiempo_para_verificacion_ms: timeToHalfOpen,
      timestamp: new Date().toISOString(),
    };
  }
}
