import { DataSource } from 'typeorm';
import { config } from 'dotenv';
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

config();

export default new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] ?? 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  username: process.env['DB_USER'] ?? 'encf_user',
  password: process.env['DB_PASSWORD'] ?? 'encf_password',
  database: process.env['DB_NAME'] ?? 'encf_db',
  entities: [
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
  ],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
