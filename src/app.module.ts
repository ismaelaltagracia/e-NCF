import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { EmpresasModule } from './modules/empresas/empresas.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { CatalogoModule } from './modules/catalogo/catalogo.module.js';
import { SecuenciasNcfModule } from './modules/secuencias-ncf/secuencias-ncf.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { PlanesModule } from './modules/planes/planes.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { DgiiModule } from './dgii/dgii.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    OnboardingModule,
    EmpresasModule,
    UsersModule,
    ApiKeysModule,
    CatalogoModule,
    SecuenciasNcfModule,
    PlanesModule,
    AdminModule,
    DgiiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
