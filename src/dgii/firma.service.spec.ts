import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as forge from 'node-forge';

import { FirmaService } from './firma.service.js';
import { Empresa } from '../database/entities/empresa.entity.js';
import { SECRETS_PROVIDER } from '../infrastructure/secrets/secrets.interface.js';

// Helper: Generate a self-signed PKCS12 for testing
function generateTestPkcs12(password: string, opts?: { expired?: boolean }): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';

  const now = new Date();
  if (opts?.expired) {
    cert.validity.notBefore = new Date(now.getTime() - 2 * 365 * 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000); // expired yesterday
  } else {
    cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  }

  const attrs = [
    { name: 'commonName', value: 'Test Empresa' },
    { name: 'organizationName', value: 'Test Corp' },
    { name: 'countryName', value: 'DO' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}

// Helper: Encrypt a PKCS12 buffer with AES-256-GCM (simulates storage)
function encryptBuffer(data: Buffer, key: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted, iv, authTag };
}

describe('FirmaService', () => {
  let service: FirmaService;
  let empresaRepo: { findOne: jest.Mock };
  let secretsProvider: { getEncryptionKey: jest.Mock };

  const ENCRYPTION_KEY = crypto.randomBytes(32);
  const PKCS12_PASSWORD = 'test-password';
  const testPkcs12 = generateTestPkcs12(PKCS12_PASSWORD);
  const { encrypted, iv, authTag } = encryptBuffer(testPkcs12, ENCRYPTION_KEY);

  const EMPRESA_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    empresaRepo = {
      findOne: jest.fn(),
    };

    secretsProvider = {
      getEncryptionKey: jest.fn().mockResolvedValue(ENCRYPTION_KEY),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FirmaService,
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

    service = module.get<FirmaService>(FirmaService);
  });

  // Helper: encrypt PKCS12 password to store in empresa
  function encryptPassword(password: string, key: Buffer): Buffer {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(Buffer.from(password, 'utf-8')), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  function createMockEmpresa(overrides?: Partial<Empresa>): Partial<Empresa> {
    return {
      id: EMPRESA_ID,
      rnc: '123456789',
      nombre: 'Test Empresa',
      certificado_encriptado: encrypted,
      salt_encriptacion: iv,
      auth_tag: authTag,
      certificado_password_encrypted: encryptPassword(PKCS12_PASSWORD, ENCRYPTION_KEY),
      ...overrides,
    };
  }

  describe('firmarSemilla', () => {
    const semillaXml = '<?xml version="1.0" encoding="utf-8"?><SemillaModel><valor>ABC123</valor></SemillaModel>';

    it('should sign a semilla XML with XAdES-BES enveloped signature', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      // Verify result contains XML signature elements
      expect(result).toContain('<ds:Signature');
      expect(result).toContain('</ds:Signature>');
      expect(result).toContain('<ds:SignedInfo');
      expect(result).toContain('<ds:KeyInfo');
    });

    it('should include X.509 certificate in KeyInfo', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('<ds:X509Data');
      expect(result).toContain('<ds:X509Certificate');
    });

    it('should include XAdES SignedProperties with SigningTime', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('SignedProperties');
      expect(result).toContain('SigningTime');
    });

    it('should include XAdES SigningCertificate', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('SigningCertificate');
    });

    it('should use SHA-256 digest algorithm', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('sha256');
    });

    it('should use RSA-SHA256 signature algorithm', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      // xmldsigjs uses the W3C URI for RSA-SHA256
      expect(result).toContain('rsa-sha256');
    });

    it('should use exclusive canonicalization (exc-c14n)', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('xml-exc-c14n');
    });

    it('should include enveloped signature transform', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);

      expect(result).toContain('enveloped-signature');
    });
  });

  describe('firmarEcf', () => {
    const ecfXml = '<?xml version="1.0" encoding="utf-8"?><ECF><Encabezado><Version>1.0</Version></Encabezado></ECF>';

    it('should sign an e-CF XML document with XAdES-BES', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      const result = await service.firmarEcf(ecfXml, EMPRESA_ID);

      expect(result).toContain('<ds:Signature');
      expect(result).toContain('</ds:Signature>');
      expect(result).toContain('<ds:KeyInfo');
      expect(result).toContain('SignedProperties');
      expect(result).toContain('SigningTime');
    });
  });

  describe('error handling - Req 6.3, 6.4', () => {
    const semillaXml = '<SemillaModel><valor>ABC</valor></SemillaModel>';

    it('should throw UnauthorizedException when empresa has no certificate (Req 6.4)', async () => {
      empresaRepo.findOne.mockResolvedValue(createMockEmpresa({
        certificado_encriptado: null,
        salt_encriptacion: null,
        auth_tag: null,
      }));

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow(UnauthorizedException);

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow('no tiene un certificado digital almacenado');
    });

    it('should throw UnauthorizedException when empresa not found', async () => {
      empresaRepo.findOne.mockResolvedValue(null);

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when certificate cannot be decrypted (Req 6.3)', async () => {
      // Use a wrong key (different from what was used to encrypt)
      const wrongKey = crypto.randomBytes(32);
      secretsProvider.getEncryptionKey.mockResolvedValue(wrongKey);

      empresaRepo.findOne.mockResolvedValue(createMockEmpresa());

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow(UnauthorizedException);

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow('desencriptación fallida');
    });

    it('should throw UnauthorizedException when certificate is expired (Req 6.3)', async () => {
      const expiredPkcs12 = generateTestPkcs12(PKCS12_PASSWORD, { expired: true });
      const { encrypted: expEnc, iv: expIv, authTag: expTag } = encryptBuffer(expiredPkcs12, ENCRYPTION_KEY);

      empresaRepo.findOne.mockResolvedValue(createMockEmpresa({
        certificado_encriptado: expEnc,
        salt_encriptacion: expIv,
        auth_tag: expTag,
      }));

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow(UnauthorizedException);

      await expect(service.firmarSemilla(semillaXml, EMPRESA_ID))
        .rejects
        .toThrow('expirado');
    });

    it('should try empty password when certificado_password_encrypted is null', async () => {
      // Generate a PKCS12 with empty password
      const emptyPwdPkcs12 = generateTestPkcs12('');
      const { encrypted: enc, iv: encIv, authTag: encAuthTag } = encryptBuffer(emptyPwdPkcs12, ENCRYPTION_KEY);

      empresaRepo.findOne.mockResolvedValue(createMockEmpresa({
        certificado_encriptado: enc,
        salt_encriptacion: encIv,
        auth_tag: encAuthTag,
        certificado_password_encrypted: null,
      }));

      const result = await service.firmarSemilla(semillaXml, EMPRESA_ID);
      expect(result).toContain('<ds:Signature');
    });
  });
});
