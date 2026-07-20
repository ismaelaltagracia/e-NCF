import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller.js';
import { PlanesModule } from '../planes/planes.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { SecuenciaNcf } from '../../database/entities/secuencia-ncf.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Empresa, SecuenciaNcf]),
    PlanesModule,
    AuthModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
