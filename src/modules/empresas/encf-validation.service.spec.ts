import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';

import { EncfValidationService, ENCF_FORMAT_REGEX } from './encf-validation.service';
import { Empresa } from '../../database/entities/empresa.entity';
import { ModoNcf } from '../../database/enums';
import { SecuenciasNcfService } from '../secuencias-ncf/secuencias-ncf.service';

describe('EncfValidationService', () => {
  let service: EncfValidationService;
  let empresaRepo: Record<string, jest.Mock>;
  let secuenciasNcfService: Record<string, jest.Mock>;

  beforeEach(async () => {
    empresaRepo = {
      findOne: jest.fn(),
    };

    secuenciasNcfService = {
      asignarSiguiente: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncfValidationService,
        {
          provide: getRepositoryToken(Empresa),
          useValue: empresaRepo,
        },
        {
          provide: SecuenciasNcfService,
          useValue: secuenciasNcfService,
        },
      ],
    }).compile();

    service = module.get<EncfValidationService>(EncfValidationService);
  });

  describe('resolveEncf - automatic mode', () => {
    it('should ignore payload e_ncf and assign from sequence in automatic mode', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
      });

      secuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E3100000001',
        secuencia_id: 'seq-1',
      });

      const result = await service.resolveEncf('empresa-1', 'E3199999999', 'E31');

      expect(result.e_ncf).toBe('E3100000001');
      expect(result.secuencia_id).toBe('seq-1');
      expect(result.modo).toBe(ModoNcf.AUTOMATICO);
      expect(secuenciasNcfService.asignarSiguiente).toHaveBeenCalledWith('empresa-1', 'E31');
    });

    it('should assign from sequence even when payload e_ncf is undefined', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
      });

      secuenciasNcfService.asignarSiguiente.mockResolvedValue({
        e_ncf: 'E3200000005',
        secuencia_id: 'seq-2',
      });

      const result = await service.resolveEncf('empresa-1', undefined, 'E32');

      expect(result.e_ncf).toBe('E3200000005');
      expect(result.secuencia_id).toBe('seq-2');
      expect(result.modo).toBe(ModoNcf.AUTOMATICO);
    });
  });

  describe('resolveEncf - manual mode', () => {
    it('should accept valid e_ncf from payload in manual mode', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.MANUAL,
      });

      const result = await service.resolveEncf('empresa-1', 'E3100000001', 'E31');

      expect(result.e_ncf).toBe('E3100000001');
      expect(result.secuencia_id).toBeNull();
      expect(result.modo).toBe(ModoNcf.MANUAL);
      expect(secuenciasNcfService.asignarSiguiente).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when e_ncf is missing in manual mode', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.MANUAL,
      });

      await expect(service.resolveEncf('empresa-1', undefined, 'E31')).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.resolveEncf('empresa-1', undefined, 'E31')).rejects.toThrow(
        'El campo e_ncf es requerido cuando modo_ncf es "manual"',
      );
    });

    it('should throw BadRequestException when e_ncf is empty string in manual mode', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.MANUAL,
      });

      await expect(service.resolveEncf('empresa-1', '', 'E31')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for invalid e_ncf format in manual mode', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.MANUAL,
      });

      await expect(service.resolveEncf('empresa-1', 'INVALID', 'E31')).rejects.toThrow(
        'Formato de e_ncf inválido',
      );
    });

    it('should throw BadRequestException for e_ncf with lowercase letters', async () => {
      empresaRepo.findOne.mockResolvedValue({
        id: 'empresa-1',
        modo_ncf: ModoNcf.MANUAL,
      });

      await expect(service.resolveEncf('empresa-1', 'e3100000001', 'E31')).rejects.toThrow(
        'Formato de e_ncf inválido',
      );
    });
  });

  describe('resolveEncf - empresa not found', () => {
    it('should throw BadRequestException when empresa does not exist', async () => {
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(service.resolveEncf('nonexistent', 'E3100000001', 'E31')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ENCF_FORMAT_REGEX', () => {
    it('should match valid e-NCF formats', () => {
      expect(ENCF_FORMAT_REGEX.test('E3100000001')).toBe(true);
      expect(ENCF_FORMAT_REGEX.test('E3200000015')).toBe(true);
      expect(ENCF_FORMAT_REGEX.test('E3399999999')).toBe(true);
      expect(ENCF_FORMAT_REGEX.test('E4100000001')).toBe(true);
    });

    it('should reject invalid e-NCF formats', () => {
      expect(ENCF_FORMAT_REGEX.test('')).toBe(false);
      expect(ENCF_FORMAT_REGEX.test('e3100000001')).toBe(false); // lowercase
      expect(ENCF_FORMAT_REGEX.test('31E00000001')).toBe(false); // wrong order
      expect(ENCF_FORMAT_REGEX.test('E31000001')).toBe(false); // too short
      expect(ENCF_FORMAT_REGEX.test('E31000000001')).toBe(false); // too long
      expect(ENCF_FORMAT_REGEX.test('EE100000001')).toBe(false); // double letter
    });
  });

  describe('validateFormat static method', () => {
    it('should return true for valid format', () => {
      expect(EncfValidationService.validateFormat('E3100000001')).toBe(true);
    });

    it('should return false for invalid format', () => {
      expect(EncfValidationService.validateFormat('INVALID')).toBe(false);
    });
  });
});
