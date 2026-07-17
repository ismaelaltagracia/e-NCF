import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService, HealthCheckResult, DgiiHealthCheckResult } from './health.service';
import { BackupStatusService } from './backup-status.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../common/guards/super-admin.guard';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: {
    checkHealth: jest.Mock;
    checkDgii: jest.Mock;
  };
  let mockBackupStatusService: {
    getLastBackupStatus: jest.Mock;
  };

  const mockResponse = () => {
    const res: any = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    mockHealthService = {
      checkHealth: jest.fn(),
      checkDgii: jest.fn(),
    };
    mockBackupStatusService = {
      getLastBackupStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthService, useValue: mockHealthService },
        { provide: BackupStatusService, useValue: mockBackupStatusService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SuperAdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('GET /health', () => {
    it('should return 200 when status is "up"', async () => {
      const healthResult: HealthCheckResult = {
        status: 'up',
        timestamp: new Date().toISOString(),
        dependencies: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
          minio: { status: 'up', latency_ms: 10 },
        },
      };
      mockHealthService.checkHealth.mockResolvedValue(healthResult);
      const res = mockResponse();

      await controller.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 200 when status is "degraded"', async () => {
      const healthResult: HealthCheckResult = {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        dependencies: {
          postgresql: { status: 'up', latency_ms: 5 },
          redis: { status: 'up', latency_ms: 2 },
          minio: { status: 'down', latency_ms: 5000 },
        },
      };
      mockHealthService.checkHealth.mockResolvedValue(healthResult);
      const res = mockResponse();

      await controller.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });

    it('should return 503 when status is "down"', async () => {
      const healthResult: HealthCheckResult = {
        status: 'down',
        timestamp: new Date().toISOString(),
        dependencies: {
          postgresql: { status: 'down', latency_ms: 5000 },
          redis: { status: 'up', latency_ms: 2 },
          minio: { status: 'up', latency_ms: 10 },
        },
      };
      mockHealthService.checkHealth.mockResolvedValue(healthResult);
      const res = mockResponse();

      await controller.getHealth(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(healthResult);
    });
  });

  describe('GET /health/dgii', () => {
    it('should return 200 when DGII is reachable', async () => {
      const dgiiResult: DgiiHealthCheckResult = {
        status: 'up',
        timestamp: new Date().toISOString(),
        latency_ms: 150,
        endpoint: 'https://ecf.dgii.gov.do/test',
      };
      mockHealthService.checkDgii.mockResolvedValue(dgiiResult);
      const res = mockResponse();

      await controller.getDgiiHealth(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(dgiiResult);
    });

    it('should return 503 when DGII is unreachable', async () => {
      const dgiiResult: DgiiHealthCheckResult = {
        status: 'down',
        timestamp: new Date().toISOString(),
        latency_ms: 10000,
        endpoint: 'https://ecf.dgii.gov.do/test',
      };
      mockHealthService.checkDgii.mockResolvedValue(dgiiResult);
      const res = mockResponse();

      await controller.getDgiiHealth(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(dgiiResult);
    });
  });

  describe('GET /health/backup', () => {
    it('should return 200 with backup status when backup exists', async () => {
      const backupStatus = {
        last_backup_at: '2024-01-15T02:00:00.000Z',
        status: 'success',
        size_bytes: 1048576,
        file: 'backup_2024-01-15.sql.gz',
      };
      mockBackupStatusService.getLastBackupStatus.mockResolvedValue(backupStatus);
      const res = mockResponse();

      await controller.getBackupHealth(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(backupStatus);
    });

    it('should return 404 when no backup has been executed yet', async () => {
      mockBackupStatusService.getLastBackupStatus.mockResolvedValue(null);
      const res = mockResponse();

      await controller.getBackupHealth(res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'No backup has been executed yet',
      });
    });
  });
});
