import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContadorController } from './contador.controller.js';
import { ContadorService } from './contador.service.js';
import { ContadorCronService } from './contador-cron.service.js';
import { Contador } from '../../database/entities/contador.entity.js';
import { ContadorEmpresa } from '../../database/entities/contador-empresa.entity.js';
import { FacturaContador } from '../../database/entities/factura-contador.entity.js';
import { ContadorUsuario } from '../../database/entities/contador-usuario.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { Plan } from '../../database/entities/plan.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Contador,
      ContadorEmpresa,
      FacturaContador,
      ContadorUsuario,
      Empresa,
      Plan,
    ]),
    AuthModule,
    InfrastructureModule,
  ],
  controllers: [ContadorController],
  providers: [ContadorService, ContadorCronService],
  exports: [ContadorService],
})
export class ContadorModule {}
