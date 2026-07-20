import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FacturasRecibidasController } from './facturas-recibidas.controller.js';
import { FacturasRecibidasService } from './facturas-recibidas.service.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaRecibida]),
    AuthModule,
  ],
  controllers: [FacturasRecibidasController],
  providers: [FacturasRecibidasService],
  exports: [FacturasRecibidasService],
})
export class FacturasRecibidasModule {}
