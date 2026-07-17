import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RetryQueueService } from './retry-queue.service.js';
import { FacturaElectronica } from '../../database/entities/factura-electronica.entity.js';
import { EstadoDgii } from '../../database/enums.js';
import { TransmisionJob, SubidaJob } from './retry-queue.interfaces.js';

// Mock BullMQ Queue
const mockAdd = jest.fn();
const mockPause = jest.fn();
const mockResume = jest.fn();
const mockClose = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: mockAdd,
    pause: mockPause,
    resume: mockResume,
    close: mockClose,
  })),
}));

describe('RetryQueueService', () => {
  let service: RetryQueueService;
  let facturaRepository: jest.Mocked<Repository<FacturaElectronica>>;
  let configService: ConfigService;

  beforeEach(async () => {
    mockAdd.mockReset();
    mockPause.mockReset();
    mockResume.mockReset();
    mockClose.mockReset();

    mockAdd.mockResolvedValue({ id: 'job-123' });
    mockPause.mockResolvedValue(undefined);
    mockResume.mockResolvedValue(undefined);
    mockClose.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryQueueService,
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
          provide: getRepositoryToken(FacturaElectronica),
          useValue: {
            update: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    }).compile();

    service = module.get<RetryQueueService>(RetryQueueService);
    facturaRepository = module.get(getRepositoryToken(FacturaElectronica));
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('encolarTransmision', () => {
    const transmisionJob: TransmisionJob = {
      factura_id: 'factura-uuid-123',
      empresa_id: 'empresa-uuid-456',
      xml_firmado: '<eCF>...</eCF>',
      correlation_id: 'corr-789',
      intento: 1,
    };

    it('should enqueue a transmission job and return the job ID', async () => {
      const jobId = await service.encolarTransmision(transmisionJob);

      expect(jobId).toBe('job-123');
      expect(mockAdd).toHaveBeenCalledWith(
        'transmitir-ecf',
        transmisionJob,
        { jobId: `tx-${transmisionJob.factura_id}-${transmisionJob.intento}` },
      );
    });

    it('should update estado_dgii to REINTENTANDO when enqueuing', async () => {
      await service.encolarTransmision(transmisionJob);

      expect(facturaRepository.update).toHaveBeenCalledWith(
        { id: transmisionJob.factura_id },
        { estado_dgii: EstadoDgii.REINTENTANDO },
      );
    });

    it('should update estado before enqueuing the job', async () => {
      const callOrder: string[] = [];
      (facturaRepository.update as jest.Mock).mockImplementation(async () => {
        callOrder.push('update');
        return { affected: 1 };
      });
      mockAdd.mockImplementation(async () => {
        callOrder.push('enqueue');
        return { id: 'job-123' };
      });

      await service.encolarTransmision(transmisionJob);

      expect(callOrder).toEqual(['update', 'enqueue']);
    });

    it('should generate unique job IDs based on factura_id and intento', async () => {
      await service.encolarTransmision(transmisionJob);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ jobId: 'tx-factura-uuid-123-1' }),
      );

      mockAdd.mockClear();
      const secondJob = { ...transmisionJob, intento: 2 };
      await service.encolarTransmision(secondJob);
      expect(mockAdd).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({ jobId: 'tx-factura-uuid-123-2' }),
      );
    });
  });

  describe('encolarSubida', () => {
    const subidaJob: SubidaJob = {
      factura_id: 'factura-uuid-123',
      empresa_id: 'empresa-uuid-456',
      tipo: 'xml',
      data_base64: 'base64data==',
      bucket: 'facturas-xml',
      key: 'empresa-456/factura-123.xml',
      content_type: 'application/xml',
      correlation_id: 'corr-789',
      intento: 1,
    };

    it('should enqueue a subida job and return the job ID', async () => {
      const jobId = await service.encolarSubida(subidaJob);

      expect(jobId).toBe('job-123');
      expect(mockAdd).toHaveBeenCalledWith(
        'subir-xml',
        subidaJob,
        { jobId: `upload-xml-${subidaJob.factura_id}-${subidaJob.intento}` },
      );
    });

    it('should use the correct job name for PDF uploads', async () => {
      const pdfJob: SubidaJob = { ...subidaJob, tipo: 'pdf', content_type: 'application/pdf' };
      await service.encolarSubida(pdfJob);

      expect(mockAdd).toHaveBeenCalledWith(
        'subir-pdf',
        pdfJob,
        expect.objectContaining({ jobId: `upload-pdf-${pdfJob.factura_id}-${pdfJob.intento}` }),
      );
    });
  });

  describe('pausar', () => {
    it('should pause the transmission queue', async () => {
      await service.pausar();

      expect(mockPause).toHaveBeenCalled();
    });
  });

  describe('reanudar', () => {
    it('should resume the transmission queue', async () => {
      await service.reanudar();

      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should close both queues on destroy', async () => {
      await service.onModuleDestroy();

      // close is called for both queues
      expect(mockClose).toHaveBeenCalledTimes(2);
    });
  });
});
