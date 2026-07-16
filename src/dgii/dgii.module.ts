import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SemillaService } from './semilla.service.js';
import { FirmaService } from './firma.service.js';
import { DgiiTokenService } from './token.service.js';
import { ConversorXmlService } from './conversor-xml.service.js';
import { Empresa } from '../database/entities/empresa.entity.js';
import { InfrastructureModule } from '../infrastructure/infrastructure.module.js';

/**
 * Módulo de integración con la DGII.
 * Provee servicios para el handshake SOAP (semilla, firma, token)
 * y transmisión de e-CF.
 *
 * @see Requisitos 5.1, 5.2, 5.3, 5.4, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1-9.5, 22.1-22.5
 */
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Empresa]), InfrastructureModule],
  providers: [SemillaService, FirmaService, DgiiTokenService, ConversorXmlService],
  exports: [SemillaService, FirmaService, DgiiTokenService, ConversorXmlService],
})
export class DgiiModule {}
