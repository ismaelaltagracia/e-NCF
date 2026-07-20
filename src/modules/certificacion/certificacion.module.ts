import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CertificacionController } from './certificacion.controller.js';
import { CertificacionService } from './certificacion.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { FacturasModule } from '../facturas/facturas.module.js';
import { FacturasRecibidasModule } from '../facturas-recibidas/facturas-recibidas.module.js';
import { SecuenciasNcfModule } from '../secuencias-ncf/secuencias-ncf.module.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';

/**
 * Módulo de certificación DGII.
 * Ejecuta los 15 pasos del set de pruebas requerido por la DGII
 * para certificar una empresa como emisor de e-CF.
 *
 * Soporta dos modos:
 * - Modo Empresa (automático): Ejecuta los 15 pasos internamente.
 * - Modo Integrador: Rastrea progreso basado en facturas reales enviadas via API.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaElectronica, FacturaRecibida, SecuenciaNcf]),
    AuthModule,
    FacturasModule,
    FacturasRecibidasModule,
    SecuenciasNcfModule,
  ],
  controllers: [CertificacionController],
  providers: [CertificacionService],
})
export class CertificacionModule {}
