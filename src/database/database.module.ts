import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Plan } from './entities/plan.entity.js';
import { Empresa } from './entities/empresa.entity.js';
import { Usuario } from './entities/usuario.entity.js';
import { SuperAdmin } from './entities/super-admin.entity.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { ApiKey } from './entities/api-key.entity.js';
import { FacturaElectronica } from './entities/factura-electronica.entity.js';
import { CatalogoItem } from './entities/catalogo-item.entity.js';
import { SecuenciaNcf } from './entities/secuencia-ncf.entity.js';
import { UsoMensual } from './entities/uso-mensual.entity.js';
import { Auditoria } from './entities/auditoria.entity.js';
import { Webhook } from './entities/webhook.entity.js';
import { RncContribuyente } from './entities/rnc-contribuyente.entity.js';
import { FacturaRecibida } from './entities/factura-recibida.entity.js';
import { Dispositivo } from './entities/dispositivo.entity.js';
import { Contador } from './entities/contador.entity.js';
import { ContadorEmpresa } from './entities/contador-empresa.entity.js';
import { FacturaContador } from './entities/factura-contador.entity.js';
import { ContadorUsuario } from './entities/contador-usuario.entity.js';

const entities = [
  Plan,
  Empresa,
  Usuario,
  SuperAdmin,
  RefreshToken,
  ApiKey,
  FacturaElectronica,
  CatalogoItem,
  SecuenciaNcf,
  UsoMensual,
  Auditoria,
  Webhook,
  RncContribuyente,
  FacturaRecibida,
  Dispositivo,
  Contador,
  ContadorEmpresa,
  FacturaContador,
  ContadorUsuario,
];

/**
 * Módulo de base de datos que configura TypeORM con PostgreSQL.
 * Lee la configuración desde variables de entorno via ConfigService.
 *
 * @see Requisitos 13.4, 27.1, 28.1
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'encf_user'),
        password: config.get<string>('DB_PASSWORD', 'encf_password'),
        database: config.get<string>('DB_NAME', 'encf_db'),
        entities,
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        migrationsRun: config.get<string>('NODE_ENV') === 'production',
        migrations: ['dist/database/migrations/*.js'],
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
