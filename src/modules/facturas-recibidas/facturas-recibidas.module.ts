import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FacturasRecibidasController } from './facturas-recibidas.controller.js';
import { FacturasRecibidasService } from './facturas-recibidas.service.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { DgiiModule } from '../../dgii/dgii.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaRecibida, Empresa]),
    AuthModule,
    DgiiModule,
  ],
  controllers: [FacturasRecibidasController],
  providers: [FacturasRecibidasService],
  exports: [FacturasRecibidasService],
})
export class FacturasRecibidasModule {}
