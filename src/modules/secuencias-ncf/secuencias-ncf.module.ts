import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecuenciasNcfService } from './secuencias-ncf.service.js';
import { SecuenciasNcfController } from './secuencias-ncf.controller.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([SecuenciaNcf, Empresa]), AuthModule],
  controllers: [SecuenciasNcfController],
  providers: [SecuenciasNcfService],
  exports: [SecuenciasNcfService],
})
export class SecuenciasNcfModule {}
