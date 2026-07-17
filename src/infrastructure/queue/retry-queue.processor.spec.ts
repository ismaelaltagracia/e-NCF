import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RetryQueueProcessor } from './retry-queue.processor.js';
import { CircuitBreakerService } from '../../dgii/circuit-breaker.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../../database/enums.js';
import {
  TransmisionJob,
  BusinessRejectionError,
  CircuitBreakerOpenError,
} from './retry-queue.interfaces.js';

// Mock BullMQ Worker
const mockWorkerPause = jest.fn().mockResolvedValue(undefined);
const mockWorkerResume = jest.fn().mockResolvedValue(undefined);
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerOn = jest.fn();
let workerProcessor: ((job: unknown) => Promise<void>) | null = null;

jest.mock('bullmq', () => ({
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: unknown) => Promise<void>) => {
    workerProcessor = processor;
    return {
      pause: mockWorkerPause,
      resume: mockWorkerResume,
      close: mockWorkerClose,
      on: mockWorkerOn,
    };
  }),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('RetryQueueProcessor', () => {
  let processor: RetryQueueProcessor;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
  let facturaRepository: jest.Mocked<Repository<FacturaElectronica>>;

  const mockJob = {
    data: {
      factura_id: 'factura-uuid-123',
      empresa_id: 'empresa-uuid-456',
      xml_firmado: '<eCF>...</eCF>',
      correlation_id: 'corr-789',
      intento: 1,
    } as TransmisionJob,
    attemptsMade: 0,
    opts: { attempts: 5 },
    id: 'job-1',
    failedReason: undefined,
  };

  beforeEach(async () => {
    mockWorkerPause.mockClear();
    mockWorkerResume.mockClear();
    mockWorkerClose.mockClear();
    mockWorkerOn.mockClear();
    workerProcessor = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryQueueProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: '',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            getState: jest.fn().mockReturnValue('CLOSED'),
            execute: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FacturaElectronica),
          useValue: {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    }).compile();

    processor = module.get<RetryQueueProcessor>(RetryQueueProcessor);
    circuitBreakerService = module.get(CircuitBreakerService);
    facturaRepository = module.get(getRepositoryToken(FacturaElectronica));

    processor.onModuleInit();
  });

  afterEach(async () => {
    await processor.onModuleDestroy();
  });

  describe('processTransmision', () => {
    it('should process a job successfully and update estado to ACEPTADO', async () => {
      circuitBreakerService.getState.mockReturnValue('CLOSED');
      circuitBreakerService.execute.mockResolvedValue(undefined);

      await workerProcessor!(mockJob);

      expect(facturaRepository.update).toHaveBeenCalledWith(
        { id: 'factura-uuid-123' },
        { estado_dgii: EstadoDgii.ACEPTADO },
      );
    });

    it('should pause worker when Circuit Breaker is OPEN', async () => {
      circuitBreakerService.getState.mockReturnValue('OPEN');

      await expect(workerProcessor!(mockJob)).rejects.toThrow(CircuitBreakerOpenError);
      expect(mockWorkerPause).toHaveBeenCalled();
    });

    it('should not retry on BusinessRejectionError and mark as RECHAZADO', async () => {
      circuitBreakerService.getState.mockReturnValue('CLOSED');
      const bizError = new BusinessRejectionError(
        'RNC inválido',
        422,
        { code: 'INVALID_RNC' },
      );
      circuitBreakerService.execute.mockRejectedValue(bizError);

      // Should NOT throw, because business rejections complete the job (no retry)
      await workerProcessor!(mockJob);

      expect(facturaRepository.update).toHaveBeenCalledWith(
        { id: 'factura-uuid-123' },
        {
          estado_dgii: EstadoDgii.RECHAZADO,
          error_dgii: { code: 'INVALID_RNC' },
        },
      );
    });

    it('should throw on transient errors to trigger BullMQ retry', async () => {
      circuitBreakerService.getState.mockReturnValue('CLOSED');
      const transientError = new Error('ECONNREFUSED');
      circuitBreakerService.execute.mockRejectedValue(transientError);

      await expect(workerProcessor!(mockJob)).rejects.toThrow('ECONNREFUSED');
    });

    it('should allow processing when Circuit Breaker is HALF-OPEN', async () => {
      circuitBreakerService.getState.mockReturnValue('HALF-OPEN');
      circuitBreakerService.execute.mockResolvedValue(undefined);

      await workerProcessor!(mockJob);

      expect(facturaRepository.update).toHaveBeenCalledWith(
        { id: 'factura-uuid-123' },
        { estado_dgii: EstadoDgii.ACEPTADO },
      );
    });
  });

  describe('pauseWorker / resumeWorker', () => {
    it('should pause the worker', async () => {
      await processor.pauseWorker();
      expect(mockWorkerPause).toHaveBeenCalled();
    });

    it('should resume the worker', async () => {
      await processor.resumeWorker();
      expect(mockWorkerResume).toHaveBeenCalled();
    });
  });

  describe('onModuleInit with OPEN circuit breaker', () => {
    it('should pause worker on init when CB is OPEN', async () => {
      // Create a fresh module with CB in OPEN state
      mockWorkerPause.mockClear();
      const freshModule: TestingModule = await Test.createTestingModule({
        providers: [
          RetryQueueProcessor,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const config: Record<string, unknown> = {
                  REDIS_HOST: 'localhost',
                  REDIS_PORT: 6379,
                  REDIS_PASSWORD: '',
                };
                return config[key] ?? defaultValue;
              }),
            },
          },
          {
            provide: CircuitBreakerService,
            useValue: {
              getState: jest.fn().mockReturnValue('OPEN'),
              execute: jest.fn(),
            },
          },
          {
            provide: getRepositoryToken(FacturaElectronica),
            useValue: {
              update: jest.fn().mockResolvedValue({ affected: 1 }),
            },
          },
        ],
      }).compile();

      const freshProcessor = freshModule.get<RetryQueueProcessor>(RetryQueueProcessor);
      freshProcessor.onModuleInit();

      // Give the async pause a tick to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockWorkerPause).toHaveBeenCalled();
      await freshProcessor.onModuleDestroy();
    });
  });
});
