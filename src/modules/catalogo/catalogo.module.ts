import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogoService } from './catalogo.service.js';
import { CatalogoController } from './catalogo.controller.js';
import { CatalogoItem } from '../../database/entities/catalogo-item.entity.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogoItem]), AuthModule],
  controllers: [CatalogoController],
  providers: [CatalogoService],
  exports: [CatalogoService],
})
export class CatalogoModule {}
