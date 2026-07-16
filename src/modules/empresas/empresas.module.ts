import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmpresasService } from './empresas.service.js';
import { EmpresasController } from './empresas.controller.js';
import { EncfValidationService } from './encf-validation.service.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { SecuenciasNcfModule } from '../secuencias-ncf/secuencias-ncf.module.js';
import { PlanesModule } from '../planes/planes.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa]),
    AuthModule,
    InfrastructureModule,
    SecuenciasNcfModule,
    PlanesModule,
  ],
  controllers: [EmpresasController],
  providers: [EmpresasService, EncfValidationService],
  exports: [EmpresasService, EncfValidationService],
})
export class EmpresasModule {}
