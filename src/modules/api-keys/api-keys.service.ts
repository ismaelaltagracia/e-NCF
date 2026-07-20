import { Injectable, ForbiddenException, NotFoundException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'node:crypto';

import { ApiKey } from '../../database/entities/api-key.entity.js';

export interface ApiKeyInfo {
  id: string;
  nombre: string;
  scopes: string[];
  activo: boolean;
  created_at: Date;
  last_used_at: Date | null;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepo: Repository<ApiKey>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Crear un nuevo API Key para la empresa.
   * Genera 256 bits random, almacena hash SHA-256 y key encriptada.
   * Req 4.1
   */
  async create(
    empresaId: string,
    nombre: string,
    scopes: string[],
  ): Promise<{ key: string; id: string }> {
    const rawKey = crypto.randomBytes(32).toString('base64');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyEncrypted = this.encryptKey(rawKey);

    const apiKey = this.apiKeyRepo.create({
      empresa_id: empresaId,
      nombre,
      key_hash: keyHash,
      key_encrypted: keyEncrypted,
      scopes,
      activo: true,
    });

    const saved = await this.apiKeyRepo.save(apiKey);

    return { key: rawKey, id: saved.id };
  }

  /**
   * Listar API Keys de una empresa (sin key ni hash).
   * Req 4.2
   */
  async listByEmpresa(empresaId: string): Promise<ApiKeyInfo[]> {
    const keys = await this.apiKeyRepo.find({
      where: { empresa_id: empresaId },
      order: { created_at: 'ASC' },
    });

    return keys.map((k) => ({
      id: k.id,
      nombre: k.nombre,
      scopes: k.scopes,
      activo: k.activo,
      created_at: k.created_at,
      last_used_at: k.last_used_at,
    }));
  }

  /**
   * Rotar un API Key: revocar el actual y generar uno nuevo con mismos scopes/nombre.
   * Req 4.3, 4.6
   */
  async rotate(
    apiKeyId: string,
    empresaId: string,
    correlationId?: string,
  ): Promise<{ key: string; id: string }> {
    const existing = await this.apiKeyRepo.findOne({
      where: { id: apiKeyId },
    });

    if (!existing) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (existing.empresa_id !== empresaId) {
      this.logger.warn(
        `Intento de rotación cross-tenant: empresa ${empresaId} -> api_key empresa ${existing.empresa_id} | ID_Correlacion: ${correlationId ?? 'N/A'}`,
      );
      throw new ForbiddenException('No tiene permisos para gestionar API keys de otra empresa');
    }

    // Revocar el actual
    existing.activo = false;
    await this.apiKeyRepo.save(existing);

    // Generar nuevo con mismos scopes y nombre
    const rawKey = crypto.randomBytes(32).toString('base64');
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyEncrypted = this.encryptKey(rawKey);

    const newApiKey = this.apiKeyRepo.create({
      empresa_id: empresaId,
      nombre: existing.nombre,
      key_hash: keyHash,
      key_encrypted: keyEncrypted,
      scopes: existing.scopes,
      activo: true,
    });

    const saved = await this.apiKeyRepo.save(newApiKey);

    return { key: rawKey, id: saved.id };
  }

  /**
   * Revocar (desactivar) un API Key.
   * Req 4.4, 4.6
   */
  async revoke(apiKeyId: string, empresaId: string, correlationId?: string): Promise<void> {
    const existing = await this.apiKeyRepo.findOne({
      where: { id: apiKeyId },
    });

    if (!existing) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (existing.empresa_id !== empresaId) {
      this.logger.warn(
        `Intento de revocación cross-tenant: empresa ${empresaId} -> api_key empresa ${existing.empresa_id} | ID_Correlacion: ${correlationId ?? 'N/A'}`,
      );
      throw new ForbiddenException('No tiene permisos para gestionar API keys de otra empresa');
    }

    existing.activo = false;
    await this.apiKeyRepo.save(existing);
  }

  /**
   * Revelar (descifrar) la key de un API Key.
   */
  async revealKey(apiKeyId: string, empresaId: string): Promise<{ key: string }> {
    const existing = await this.apiKeyRepo.findOne({
      where: { id: apiKeyId },
    });

    if (!existing) {
      throw new NotFoundException('API Key no encontrada');
    }

    if (existing.empresa_id !== empresaId) {
      throw new ForbiddenException('No tiene permisos para gestionar API keys de otra empresa');
    }

    if (!existing.key_encrypted) {
      throw new NotFoundException('La key encriptada no está disponible para esta API Key');
    }

    const plainKey = this.decryptKey(existing.key_encrypted);
    return { key: plainKey };
  }

  /* ---------- Encryption Helpers ---------- */

  private getEncryptionKey(): Buffer {
    const hex = this.configService.get<string>('ENCRYPTION_KEY') || '';
    return Buffer.from(hex, 'hex');
  }

  private encryptKey(plainKey: string): Buffer {
    const encryptionKey = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plainKey, 'utf-8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]);
  }

  private decryptKey(keyEncrypted: Buffer): string {
    const encryptionKey = this.getEncryptionKey();
    const iv = keyEncrypted.subarray(0, 12);
    const authTag = keyEncrypted.subarray(12, 28);
    const ciphertext = keyEncrypted.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  }
}
