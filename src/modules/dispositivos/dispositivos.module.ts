import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DispositivosController } from './dispositivos.controller.js';
import { DispositivosService } from './dispositivos.service.js';
import { Dispositivo } from '../../database/entities/dispositivo.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { ApiKey } from '../../database/entities/api-key.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispositivo, Empresa, ApiKey]),
    AuthModule,
  ],
  controllers: [DispositivosController],
  providers: [DispositivosService],
  exports: [DispositivosService],
})
export class DispositivosModule {}
