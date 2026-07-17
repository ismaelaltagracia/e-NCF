import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { SpaFallbackMiddleware } from './common/middleware/spa-fallback.middleware.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { EmpresasModule } from './modules/empresas/empresas.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { ApiKeysModule } from './modules/api-keys/api-keys.module.js';
import { CatalogoModule } from './modules/catalogo/catalogo.module.js';
import { SecuenciasNcfModule } from './modules/secuencias-ncf/secuencias-ncf.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { RetryQueueModule } from './infrastructure/queue/retry-queue.module.js';
import { PlanesModule } from './modules/planes/planes.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { DgiiModule } from './dgii/dgii.module.js';
import { FacturasModule } from './modules/facturas/facturas.module.js';
import { AuditoriaModule } from './modules/auditoria/auditoria.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    DatabaseModule,
    RedisModule,
    RetryQueueModule,
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
    FacturasModule,
    AuditoriaModule,
    WebhooksModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SpaFallbackMiddleware).forRoutes('app', 'app/*path');
  }
}
