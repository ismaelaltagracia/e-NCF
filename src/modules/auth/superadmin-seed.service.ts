import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { SuperAdmin } from '../../database/entities/super-admin.entity.js';

const BCRYPT_COST = 12;

/**
 * Crea el Super Admin inicial al arrancar la aplicación, a partir de las variables
 * de entorno SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD (y SUPERADMIN_NOMBRE opcional).
 *
 * Características:
 * - Las credenciales NO viven en el código: se leen del entorno (del `.env` del
 *   servidor, que no está versionado).
 * - Idempotente: si ya existe un super admin con ese email, no hace nada. Si no hay
 *   variables definidas, tampoco hace nada (no es un error).
 * - Funciona independientemente de las migraciones (útil con synchronize activo).
 */
@Injectable()
export class SuperAdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(SuperAdminSeedService.name);

  constructor(
    @InjectRepository(SuperAdmin)
    private readonly superAdminRepo: Repository<SuperAdmin>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.configService.get<string>('SUPERADMIN_EMAIL')?.trim();
    const password = this.configService.get<string>('SUPERADMIN_PASSWORD');
    const nombre = this.configService.get<string>('SUPERADMIN_NOMBRE')?.trim() || 'Super Admin';

    if (!email || !password) {
      // Sin credenciales en el entorno: no se siembra nada.
      return;
    }

    const existente = await this.superAdminRepo.findOne({ where: { email } });
    if (existente) {
      // Ya existe: no se pisa ni se duplica.
      return;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const superAdmin = this.superAdminRepo.create({
      email,
      password_hash: passwordHash,
      nombre,
      activo: true,
    });
    await this.superAdminRepo.save(superAdmin);

    this.logger.log(`Super admin inicial creado: ${email}`);
  }
}
