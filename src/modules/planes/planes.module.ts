import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanesService } from './planes.service.js';
import { Plan } from '../../database/entities/plan.entity.js';
import { UsoMensual } from '../../database/entities/uso-mensual.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, UsoMensual, Empresa]), AuthModule],
  providers: [PlanesService],
  exports: [PlanesService],
})
export class PlanesModule {}
