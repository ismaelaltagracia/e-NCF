import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ReportesController } from './reportes.controller.js';
import { ReportesService } from './reportes.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { FacturaRecibida } from '../../database/entities/factura-recibida.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([FacturaElectronica, FacturaRecibida, Empresa]),
    AuthModule,
  ],
  controllers: [ReportesController],
  providers: [ReportesService],
})
export class ReportesModule {}
