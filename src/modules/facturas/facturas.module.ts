import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FacturasController } from './facturas.controller.js';
import { FacturasService } from './facturas.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { DgiiModule } from '../../dgii/dgii.module.js';
import { PlanesModule } from '../planes/planes.module.js';
import { SecuenciasNcfModule } from '../secuencias-ncf/secuencias-ncf.module.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AuditoriaModule } from '../auditoria/auditoria.module.js';

/**
 * Módulo de facturación electrónica.
 * Orquesta el flujo completo: validación → límite → NCF → XML → firma → S3 → DGII.
 *
 * @see Requirements 8.6, 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 18.2, 18.3, 18.4
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaElectronica, Empresa]),
    DgiiModule,
    PlanesModule,
    SecuenciasNcfModule,
    InfrastructureModule,
    AuthModule,
    AuditoriaModule,
  ],
  controllers: [FacturasController],
  providers: [FacturasService],
  exports: [FacturasService],
})
export class FacturasModule {}
