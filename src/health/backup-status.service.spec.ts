import { BackupStatusService } from './backup-status.service.js';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';

jest.mock('fs/promises');
jest.mock('fs');

describe('BackupStatusService', () => {
  let service: BackupStatusService;

  beforeEach(() => {
    process.env.BACKUP_STATUS_PATH = '/backups/backup-status.json';
    service = new BackupStatusService();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('getLastBackupStatus', () => {
    it('should return null when status file does not exist', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(false);

      const result = await service.getLastBackupStatus();

      expect(result).toBeNull();
    });

    it('should return backup status on success', async () => {
      const mockStatus = {
        last_backup: {
          timestamp: '2024-01-15T02:00:05Z',
          success: true,
          size_bytes: 1234567,
          filename: 'backup_2024-01-15_02-00-05.sql.gz',
        },
      };

      (fsSync.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockStatus));

      const result = await service.getLastBackupStatus();

      expect(result).toEqual(mockStatus);
      expect(result!.last_backup.success).toBe(true);
      expect((result!.last_backup as any).size_bytes).toBe(1234567);
    });

    it('should return backup status on failure', async () => {
      const mockStatus = {
        last_backup: {
          timestamp: '2024-01-15T02:00:05Z',
          success: false,
          error: 'pg_dump failed: connection refused',
        },
      };

      (fsSync.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockStatus));

      const result = await service.getLastBackupStatus();

      expect(result).toEqual(mockStatus);
      expect(result!.last_backup.success).toBe(false);
      expect((result!.last_backup as any).error).toBe(
        'pg_dump failed: connection refused',
      );
    });

    it('should return null when file has invalid JSON', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue('not valid json');

      const result = await service.getLastBackupStatus();

      expect(result).toBeNull();
    });

    it('should return null when file has invalid format (missing last_backup)', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({ something: 'else' }),
      );

      const result = await service.getLastBackupStatus();

      expect(result).toBeNull();
    });

    it('should return null when readFile throws an error', async () => {
      (fsSync.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFile as jest.Mock).mockRejectedValue(
        new Error('Permission denied'),
      );

      const result = await service.getLastBackupStatus();

      expect(result).toBeNull();
    });
  });
});
