import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { SemillaService } from './semilla.service.js';
import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { ConversorXmlService } from './conversor-xml.service.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { TransmisionService } from './transmision.service.js';
import { RncValidatorService } from './rnc-validator.service.js';
import { RncValidatorController } from './rnc-validator.controller.js';
import { RecepcionController } from './recepcion.controller.js';
import { DgiiStatusController } from './dgii-status.controller.js';
import { EstadoPollingService } from './estado-polling.service.js';
import { AnulacionService } from './anulacion.service.js';
import { Empresa } from '../database/entities/empresa.entity.js';
import { FacturaElectronica } from '../database/entities/factura-electronica.entity.js';
import { RncContribuyente } from '../database/entities/rnc-contribuyente.entity.js';
import { FacturaRecibida } from '../database/entities/factura-recibida.entity.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';
import { AuthModule } from '../modules/auth/auth.module.js';
import { WebhooksModule } from '../modules/webhooks/webhooks.module.js';

/**
 * Módulo de integración con la DGII.
 * Provee servicios para el handshake SOAP (semilla, firma, token),
 * transmisión de e-CF, resiliencia (circuit breaker), validación de RNC,
 * y polling de estado de facturas.
 *
 * @see Requisitos 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1-9.5, 11.1-11.5, 12.1-12.5, 22.1-22.5, 29.1-29.6, 33.1-33.6
 */
@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([Empresa, FacturaElectronica, RncContribuyente, FacturaRecibida]),
    InfrastructureModule,
    AuthModule,
    WebhooksModule,
  ],
  controllers: [RncValidatorController, RecepcionController, DgiiStatusController],
  providers: [
    SemillaService,
    FirmaService,
    DgiiTokenService,
    ConversorXmlService,
    CircuitBreakerService,
    TransmisionService,
    RncValidatorService,
    EstadoPollingService,
    AnulacionService,
  ],
  exports: [
    SemillaService,
    FirmaService,
    DgiiTokenService,
    ConversorXmlService,
    CircuitBreakerService,
    TransmisionService,
    RncValidatorService,
    EstadoPollingService,
    AnulacionService,
  ],
})
export class DgiiModule {}
