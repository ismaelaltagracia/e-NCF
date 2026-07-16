import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { RolesGuard, ScopesGuard } from '../../common/guards/index.js';
import { Usuario } from '../../database/entities/usuario.entity.js';
import { Empresa } from '../../database/entities/empresa.entity.js';
import { RefreshToken } from '../../database/entities/refresh-token.entity.js';
import { SuperAdmin } from '../../database/entities/super-admin.entity.js';
import { ApiKey } from '../../database/entities/api-key.entity.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Usuario, Empresa, RefreshToken, SuperAdmin, ApiKey]),
    InfrastructureModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, ApiKeyGuard, RolesGuard, ScopesGuard],
  exports: [AuthService, JwtAuthGuard, ApiKeyGuard, RolesGuard, ScopesGuard],
})
export class AuthModule {}
