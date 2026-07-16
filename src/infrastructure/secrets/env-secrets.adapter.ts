import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import { ISecretsProvider } from './secrets.interface.js';

/**
 * Implementación de ISecretsProvider que lee secretos desde variables de entorno.
 * Para despliegue on-premise con Docker Compose.
 *
 * - ENCRYPTION_KEY: string hexadecimal de 32 bytes (64 caracteres hex)
 * - JWT_PRIVATE_KEY_PATH: ruta al archivo PEM de clave privada RSA
 * - JWT_PUBLIC_KEY_PATH: ruta al archivo PEM de clave pública RSA
 *
 * @see Requisito 24.2
 */
@Injectable()
export class EnvSecretsAdapter implements ISecretsProvider {
  constructor(private readonly configService: ConfigService) {}

  async getEncryptionKey(): Promise<Buffer> {
    const hexKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!hexKey) {
      throw new Error('ENCRYPTION_KEY environment variable is not set');
    }

    const buffer = Buffer.from(hexKey, 'hex');
    if (buffer.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters), got ${buffer.length} bytes`,
      );
    }

    return buffer;
  }

  async getJwtPrivateKey(): Promise<string> {
    const keyPath = this.configService.get<string>('JWT_PRIVATE_KEY_PATH');
    if (!keyPath) {
      throw new Error('JWT_PRIVATE_KEY_PATH environment variable is not set');
    }

    return fs.readFileSync(keyPath, 'utf-8');
  }

  async getJwtPublicKey(): Promise<string> {
    const keyPath = this.configService.get<string>('JWT_PUBLIC_KEY_PATH');
    if (!keyPath) {
      throw new Error('JWT_PUBLIC_KEY_PATH environment variable is not set');
    }

    return fs.readFileSync(keyPath, 'utf-8');
  }
}
