import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';

import { EmpresasService } from './empresas.service';
import { Empresa } from '../../database/entities/empresa.entity';
import { EstadoEmpresa, ModoNcf } from '../../database/enums';
import { SECRETS_PROVIDER } from '../../infrastructure/secrets/secrets.interface';

// Helper: generate a self-signed PKCS12 certificate for testing
function generateTestPkcs12(options: { rnc: string; password: string; expired?: boolean }): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';

  const now = new Date();
  if (options.expired) {
    cert.validity.notBefore = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now.getTime() - 1 * 365 * 24 * 60 * 60 * 1000);
  } else {
    cert.validity.notBefore = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  }

  const attrs = [
    { name: 'commonName', value: 'Test Company' },
    { name: 'organizationName', value: 'Test Org' },
    { type: '2.5.4.5', value: options.rnc }, // serialName with RNC
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], options.password);
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

  return Buffer.from(p12Der, 'binary');
}

describe('EmpresasService', () => {
  let service: EmpresasService;
  let empresaRepo: Record<string, jest.Mock>;
  let secretsProvider: Record<string, jest.Mock>;

  const ENCRYPTION_KEY = crypto.randomBytes(32);

  beforeEach(async () => {
    empresaRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    secretsProvider = {
      getEncryptionKey: jest.fn().mockResolvedValue(ENCRYPTION_KEY),
      getJwtPrivateKey: jest.fn(),
      getJwtPublicKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmpresasService,
        {
          provide: getRepositoryToken(Empresa),
          useValue: empresaRepo,
        },
        {
          provide: SECRETS_PROVIDER,
          useValue: secretsProvider,
        },
      ],
    }).compile();

    service = module.get<EmpresasService>(EmpresasService);
  });

  describe('uploadCertificado', () => {
    const testRnc = '123456789';
    const testPassword = 'test-password';

    it('should upload and encrypt a valid certificate', async () => {
      const p12Buffer = generateTestPkcs12({ rnc: testRnc, password: testPassword });
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.CERTIFICACION,
        certificado_encriptado: null,
        salt_encriptacion: null,
        auth_tag: null,
      };

      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.uploadCertificado('empresa-1', p12Buffer, testPassword);

      expect(result.message).toContain('exitosamente');
      expect(result.estado).toBe(EstadoEmpresa.ACTIVO);
      expect(empresaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          certificado_encriptado: expect.any(Buffer),
          salt_encriptacion: expect.any(Buffer),
          auth_tag: expect.any(Buffer),
          estado: EstadoEmpresa.ACTIVO,
        }),
      );
    });

    it('should throw NotFoundException if empresa not found', async () => {
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.uploadCertificado('nonexistent', Buffer.from('test'), 'pass'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException for invalid PKCS12', async () => {
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.CERTIFICACION,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);

      await expect(
        service.uploadCertificado('empresa-1', Buffer.from('not-a-pkcs12'), testPassword),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for wrong password', async () => {
      const p12Buffer = generateTestPkcs12({ rnc: testRnc, password: testPassword });
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.CERTIFICACION,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);

      await expect(
        service.uploadCertificado('empresa-1', p12Buffer, 'wrong-password'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for expired certificate', async () => {
      const p12Buffer = generateTestPkcs12({
        rnc: testRnc,
        password: testPassword,
        expired: true,
      });
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.CERTIFICACION,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);

      await expect(service.uploadCertificado('empresa-1', p12Buffer, testPassword)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for RNC mismatch', async () => {
      const p12Buffer = generateTestPkcs12({ rnc: '999999999', password: testPassword });
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.CERTIFICACION,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);

      await expect(service.uploadCertificado('empresa-1', p12Buffer, testPassword)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should not change estado if already "activo"', async () => {
      const p12Buffer = generateTestPkcs12({ rnc: testRnc, password: testPassword });
      const empresa = {
        id: 'empresa-1',
        rnc: testRnc,
        estado: EstadoEmpresa.ACTIVO,
        certificado_encriptado: null,
        salt_encriptacion: null,
        auth_tag: null,
      };

      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.uploadCertificado('empresa-1', p12Buffer, testPassword);

      expect(result.estado).toBe(EstadoEmpresa.ACTIVO);
    });
  });

  describe('encryptCertificate / decryptCertificate round-trip', () => {
    it('should encrypt and decrypt back to original data', () => {
      const originalData = crypto.randomBytes(512);
      const key = crypto.randomBytes(32);

      const { encrypted, iv, authTag } = service.encryptCertificate(originalData, key);
      const decrypted = service.decryptCertificate(encrypted, key, iv, authTag);

      expect(decrypted).toEqual(originalData);
    });

    it('should produce different ciphertext for same data (random IV)', () => {
      const originalData = crypto.randomBytes(512);
      const key = crypto.randomBytes(32);

      const result1 = service.encryptCertificate(originalData, key);
      const result2 = service.encryptCertificate(originalData, key);

      expect(result1.encrypted).not.toEqual(result2.encrypted);
      expect(result1.iv).not.toEqual(result2.iv);
    });

    it('should produce IV of 12 bytes', () => {
      const data = Buffer.from('test data');
      const key = crypto.randomBytes(32);

      const { iv } = service.encryptCertificate(data, key);
      expect(iv.length).toBe(12);
    });

    it('should produce authTag of 16 bytes', () => {
      const data = Buffer.from('test data');
      const key = crypto.randomBytes(32);

      const { authTag } = service.encryptCertificate(data, key);
      expect(authTag.length).toBe(16);
    });

    it('should fail decryption with wrong key', () => {
      const data = Buffer.from('test data');
      const key = crypto.randomBytes(32);
      const wrongKey = crypto.randomBytes(32);

      const { encrypted, iv, authTag } = service.encryptCertificate(data, key);

      expect(() => {
        service.decryptCertificate(encrypted, wrongKey, iv, authTag);
      }).toThrow();
    });

    it('should fail decryption with tampered authTag', () => {
      const data = Buffer.from('test data');
      const key = crypto.randomBytes(32);

      const { encrypted, iv, authTag } = service.encryptCertificate(data, key);
      const tamperedAuthTag = Buffer.from(authTag);
      tamperedAuthTag[0] ^= 0xff;

      expect(() => {
        service.decryptCertificate(encrypted, key, iv, tamperedAuthTag);
      }).toThrow();
    });
  });

  describe('parsePkcs12', () => {
    it('should parse a valid PKCS12 file', () => {
      const p12Buffer = generateTestPkcs12({ rnc: '123456789', password: 'pass' });
      const result = service.parsePkcs12(p12Buffer, 'pass');
      expect(result.certPem).toBeDefined();
      expect(result.certPem.subject).toBeDefined();
    });
  });

  describe('extractRncFromCertificate', () => {
    it('should extract RNC from serialName field', () => {
      const p12Buffer = generateTestPkcs12({ rnc: '12345678901', password: 'pass' });
      const { certPem } = service.parsePkcs12(p12Buffer, 'pass');
      const rnc = service.extractRncFromCertificate(certPem);
      expect(rnc).toBe('12345678901');
    });
  });

  describe('validateExpiration', () => {
    it('should not throw for a non-expired certificate', () => {
      const p12Buffer = generateTestPkcs12({ rnc: '123456789', password: 'pass' });
      const { certPem } = service.parsePkcs12(p12Buffer, 'pass');
      expect(() => service.validateExpiration(certPem)).not.toThrow();
    });

    it('should throw for an expired certificate', () => {
      const p12Buffer = generateTestPkcs12({ rnc: '123456789', password: 'pass', expired: true });
      const { certPem } = service.parsePkcs12(p12Buffer, 'pass');
      expect(() => service.validateExpiration(certPem)).toThrow(BadRequestException);
    });
  });

  describe('updateConfiguracion', () => {
    it('should update modo_ncf to manual', async () => {
      const empresa = {
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
        validar_rnc_receptor: true,
        formato_pdf: null,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.updateConfiguracion('empresa-1', {
        modo_ncf: ModoNcf.MANUAL,
      });

      expect(result.modo_ncf).toBe(ModoNcf.MANUAL);
      expect(empresaRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ modo_ncf: ModoNcf.MANUAL }),
      );
    });

    it('should update validar_rnc_receptor', async () => {
      const empresa = {
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
        validar_rnc_receptor: true,
        formato_pdf: null,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.updateConfiguracion('empresa-1', {
        validar_rnc_receptor: false,
      });

      expect(result.validar_rnc_receptor).toBe(false);
    });

    it('should update formato_pdf', async () => {
      const empresa = {
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
        validar_rnc_receptor: true,
        formato_pdf: null,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.updateConfiguracion('empresa-1', {
        formato_pdf: 'ticket',
      });

      expect(result.formato_pdf).toBe('ticket');
    });

    it('should update multiple fields at once', async () => {
      const empresa = {
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
        validar_rnc_receptor: true,
        formato_pdf: null,
      };
      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.updateConfiguracion('empresa-1', {
        modo_ncf: ModoNcf.MANUAL,
        validar_rnc_receptor: false,
        formato_pdf: 'carta',
      });

      expect(result.modo_ncf).toBe(ModoNcf.MANUAL);
      expect(result.validar_rnc_receptor).toBe(false);
      expect(result.formato_pdf).toBe('carta');
    });

    it('should throw NotFoundException when empresa does not exist', async () => {
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateConfiguracion('nonexistent', { modo_ncf: ModoNcf.MANUAL }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not modify fields not included in dto', async () => {
      const empresa = {
        id: 'empresa-1',
        modo_ncf: ModoNcf.AUTOMATICO,
        validar_rnc_receptor: true,
        formato_pdf: 'ticket',
      };
      empresaRepo.findOne.mockResolvedValue(empresa);
      empresaRepo.save.mockResolvedValue(empresa);

      const result = await service.updateConfiguracion('empresa-1', {
        modo_ncf: ModoNcf.MANUAL,
      });

      expect(result.modo_ncf).toBe(ModoNcf.MANUAL);
      expect(result.validar_rnc_receptor).toBe(true);
      expect(result.formato_pdf).toBe('ticket');
    });
  });
});
