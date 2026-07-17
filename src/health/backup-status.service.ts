import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface BackupStatusSuccess {
  timestamp: string;
  success: true;
  size_bytes: number;
  filename: string;
}

export interface BackupStatusFailure {
  timestamp: string;
  success: false;
  error: string;
}

export type BackupStatus = BackupStatusSuccess | BackupStatusFailure;

export interface BackupStatusResponse {
  last_backup: BackupStatus;
}

const BACKUP_STATUS_PATH = '/backups/backup-status.json';

/**
 * Servicio que lee el estado del último backup desde el archivo
 * compartido con el contenedor de backup vía volumen Docker.
 *
 * @see Requisitos 34.5, 34.6
 */
@Injectable()
export class BackupStatusService {
  private readonly logger = new Logger(BackupStatusService.name);
  private readonly statusFilePath: string;

  constructor() {
    this.statusFilePath =
      process.env.BACKUP_STATUS_PATH || BACKUP_STATUS_PATH;
  }

  /**
   * Lee el archivo backup-status.json del volumen compartido.
   * Retorna null si no existe o no se puede leer.
   */
  async getLastBackupStatus(): Promise<BackupStatusResponse | null> {
    try {
      if (!existsSync(this.statusFilePath)) {
        this.logger.debug(
          `Backup status file not found at ${this.statusFilePath}`,
        );
        return null;
      }

      const content = await readFile(this.statusFilePath, 'utf-8');
      const parsed = JSON.parse(content) as BackupStatusResponse;

      if (!parsed.last_backup || typeof parsed.last_backup.success !== 'boolean') {
        this.logger.warn('Backup status file has invalid format');
        return null;
      }

      return parsed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to read backup status: ${message}`);
      return null;
    }
  }
}
