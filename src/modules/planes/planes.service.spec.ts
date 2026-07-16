import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PlanesService } from './planes.service';
import { Plan } from '../../database/entities/plan.entity';
import { UsoMensual } from '../../database/entities/uso-mensual.entity';
import { Empresa } from '../../database/entities/empresa.entity';

describe('PlanesService', () => {
  let service: PlanesService;
  let planRepo: any;
  let usoMensualRepo: any;
  let empresaRepo: any;

  const mockPlanBasico: Partial<Plan> = {
    id: '11111111-1111-1111-1111-111111111111',
    nombre: 'Básico',
    limite_facturas_mensual: 50,
    precio: '29.99',
    activo: true,
  };

  const mockPlanEmpresarial: Partial<Plan> = {
    id: '33333333-3333-3333-3333-333333333333',
    nombre: 'Empresarial',
    limite_facturas_mensual: null,
    precio: '199.99',
    activo: true,
  };

  const mockEmpresa: Partial<Empresa> = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    rnc: '101000001',
    nombre: 'Test Corp',
    plan_id: mockPlanBasico.id!,
    plan: mockPlanBasico as Plan,
  };

  const mockUsoMensual: Partial<UsoMensual> = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    empresa_id: mockEmpresa.id!,
    anio: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    facturas_generadas: 10,
    limite_aplicado: 50,
    plan_nombre: 'Básico',
  };

  beforeEach(async () => {
    const mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    planRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'new-id', ...data })),
    };

    usoMensualRepo = {
      findOne: jest.fn(),
      create: jest.fn((data: any) => data),
      save: jest.fn((data: any) => Promise.resolve({ id: 'new-uso-id', ...data })),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    empresaRepo = {
      findOne: jest.fn(),
      save: jest.fn((data: any) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanesService,
        { provide: getRepositoryToken(Plan), useValue: planRepo },
        { provide: getRepositoryToken(UsoMensual), useValue: usoMensualRepo },
        { provide: getRepositoryToken(Empresa), useValue: empresaRepo },
      ],
    }).compile();

    service = module.get<PlanesService>(PlanesService);
  });

  describe('seedDefaultPlans', () => {
    it('should create plans that do not exist', async () => {
      planRepo.findOne.mockResolvedValue(null);

      await service.seedDefaultPlans();

      expect(planRepo.save).toHaveBeenCalledTimes(3);
      expect(planRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Básico', limite_facturas_mensual: 50 }),
      );
      expect(planRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Profesional', limite_facturas_mensual: 200 }),
      );
      expect(planRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ nombre: 'Empresarial', limite_facturas_mensual: null }),
      );
    });

    it('should not create plans that already exist', async () => {
      planRepo.findOne.mockResolvedValue(mockPlanBasico);

      await service.seedDefaultPlans();

      expect(planRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all plans ordered by precio', async () => {
      planRepo.find.mockResolvedValue([mockPlanBasico, mockPlanEmpresarial]);

      const result = await service.findAll();

      expect(planRepo.find).toHaveBeenCalledWith({ order: { precio: 'ASC' } });
      expect(result).toHaveLength(2);
    });
  });

  describe('getOrCreateUsoMensual', () => {
    it('should return existing uso_mensual if found', async () => {
      usoMensualRepo.findOne.mockResolvedValue(mockUsoMensual);

      const result = await service.getOrCreateUsoMensual(mockEmpresa.id!);

      expect(result).toEqual(mockUsoMensual);
      expect(usoMensualRepo.save).not.toHaveBeenCalled();
    });

    it('should create new uso_mensual if not found', async () => {
      usoMensualRepo.findOne.mockResolvedValueOnce(null);
      empresaRepo.findOne.mockResolvedValue(mockEmpresa);

      const now = new Date();
      const savedUso = {
        empresa_id: mockEmpresa.id,
        anio: now.getFullYear(),
        mes: now.getMonth() + 1,
        facturas_generadas: 0,
        limite_aplicado: 50,
        plan_nombre: 'Básico',
      };
      usoMensualRepo.save.mockResolvedValue(savedUso);

      const result = await service.getOrCreateUsoMensual(mockEmpresa.id!);

      expect(usoMensualRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresa_id: mockEmpresa.id,
          facturas_generadas: 0,
          limite_aplicado: 50,
          plan_nombre: 'Básico',
        }),
      );
      expect(result).toEqual(savedUso);
    });
  });

  describe('verificarLimite', () => {
    it('should not throw when under limit', async () => {
      usoMensualRepo.findOne.mockResolvedValue(mockUsoMensual);

      await expect(service.verificarLimite(mockEmpresa.id!)).resolves.not.toThrow();
    });

    it('should throw 402 when at limit', async () => {
      const usoAtLimit = { ...mockUsoMensual, facturas_generadas: 50 };
      usoMensualRepo.findOne.mockResolvedValue(usoAtLimit);

      await expect(service.verificarLimite(mockEmpresa.id!)).rejects.toThrow(HttpException);

      try {
        await service.verificarLimite(mockEmpresa.id!);
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
      }
    });

    it('should throw 402 when over limit', async () => {
      const usoOverLimit = { ...mockUsoMensual, facturas_generadas: 55 };
      usoMensualRepo.findOne.mockResolvedValue(usoOverLimit);

      await expect(service.verificarLimite(mockEmpresa.id!)).rejects.toThrow(HttpException);
    });

    it('should not throw when plan is unlimited (limite_aplicado = null)', async () => {
      const usoUnlimited = { ...mockUsoMensual, limite_aplicado: null, facturas_generadas: 9999 };
      usoMensualRepo.findOne.mockResolvedValue(usoUnlimited);

      await expect(service.verificarLimite(mockEmpresa.id!)).resolves.not.toThrow();
    });
  });

  describe('incrementarUso', () => {
    it('should atomically increment facturas_generadas', async () => {
      usoMensualRepo.findOne.mockResolvedValue(mockUsoMensual);

      await service.incrementarUso(mockEmpresa.id!);

      const qb = usoMensualRepo.createQueryBuilder();
      expect(qb.update).toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith({
        facturas_generadas: expect.any(Function),
      });
      expect(qb.execute).toHaveBeenCalled();
    });
  });

  describe('getUsoActual', () => {
    it('should return usage info with remaining count', async () => {
      empresaRepo.findOne.mockResolvedValue(mockEmpresa);
      usoMensualRepo.findOne.mockResolvedValue(mockUsoMensual);

      const result = await service.getUsoActual(mockEmpresa.id!);

      expect(result).toEqual({
        plan_nombre: 'Básico',
        limite_mensual: 50,
        facturas_generadas: 10,
        restante: 40,
        precio: '29.99',
      });
    });

    it('should return null restante for unlimited plan', async () => {
      const empresaUnlimited = {
        ...mockEmpresa,
        plan: mockPlanEmpresarial,
      };
      const usoUnlimited = { ...mockUsoMensual, limite_aplicado: null, plan_nombre: 'Empresarial' };

      empresaRepo.findOne.mockResolvedValue(empresaUnlimited);
      usoMensualRepo.findOne.mockResolvedValue(usoUnlimited);

      const result = await service.getUsoActual(mockEmpresa.id!);

      expect(result.restante).toBeNull();
      expect(result.plan_nombre).toBe('Empresarial');
    });

    it('should throw NotFoundException if empresa not found', async () => {
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(service.getUsoActual('non-existent-id')).rejects.toThrow();
    });
  });

  describe('cambiarPlan', () => {
    it('should update empresa plan_id', async () => {
      planRepo.findOne.mockResolvedValue(mockPlanEmpresarial);
      empresaRepo.findOne.mockResolvedValue({ ...mockEmpresa });
      empresaRepo.save.mockResolvedValue({
        ...mockEmpresa,
        plan_id: mockPlanEmpresarial.id,
      });

      const result = await service.cambiarPlan(mockEmpresa.id!, mockPlanEmpresarial.id!);

      expect(result.plan_id).toBe(mockPlanEmpresarial.id);
    });

    it('should throw NotFoundException if plan not found', async () => {
      planRepo.findOne.mockResolvedValue(null);

      await expect(service.cambiarPlan(mockEmpresa.id!, 'non-existent-plan')).rejects.toThrow();
    });

    it('should throw NotFoundException if empresa not found', async () => {
      planRepo.findOne.mockResolvedValue(mockPlanBasico);
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(service.cambiarPlan('non-existent', mockPlanBasico.id!)).rejects.toThrow();
    });
  });
});
