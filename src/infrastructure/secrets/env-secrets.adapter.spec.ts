import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EnvSecretsAdapter } from './env-secrets.adapter';

// Mock node:fs
jest.mock('node:fs', () => ({
  readFileSync: jest.fn(),
}));

import * as fs from 'node:fs';

describe('EnvSecretsAdapter', () => {
  let adapter: EnvSecretsAdapter;
  let mockConfigGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigGet = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [EnvSecretsAdapter, { provide: ConfigService, useValue: { get: mockConfigGet } }],
    }).compile();

    adapter = module.get<EnvSecretsAdapter>(EnvSecretsAdapter);
  });

  describe('getEncryptionKey', () => {
    it('should return a 32-byte Buffer from a valid hex string', async () => {
      const validHexKey = 'a'.repeat(64); // 64 hex chars = 32 bytes
      mockConfigGet.mockReturnValue(validHexKey);

      const result = await adapter.getEncryptionKey();

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(32);
      expect(mockConfigGet).toHaveBeenCalledWith('ENCRYPTION_KEY');
    });

    it('should throw when ENCRYPTION_KEY is not set', async () => {
      mockConfigGet.mockReturnValue(undefined);

      await expect(adapter.getEncryptionKey()).rejects.toThrow(
        'ENCRYPTION_KEY environment variable is not set',
      );
    });

    it('should throw when ENCRYPTION_KEY is not 32 bytes', async () => {
      mockConfigGet.mockReturnValue('abcdef'); // Only 3 bytes

      await expect(adapter.getEncryptionKey()).rejects.toThrow(
        'ENCRYPTION_KEY must be a 32-byte hex string (64 hex characters), got 3 bytes',
      );
    });
  });

  describe('getJwtPrivateKey', () => {
    it('should read and return the private key file content', async () => {
      const mockKey = '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
      mockConfigGet.mockReturnValue('./keys/private.pem');
      (fs.readFileSync as jest.Mock).mockReturnValue(mockKey);

      const result = await adapter.getJwtPrivateKey();

      expect(result).toBe(mockKey);
      expect(mockConfigGet).toHaveBeenCalledWith('JWT_PRIVATE_KEY_PATH');
      expect(fs.readFileSync).toHaveBeenCalledWith('./keys/private.pem', 'utf-8');
    });

    it('should throw when JWT_PRIVATE_KEY_PATH is not set', async () => {
      mockConfigGet.mockReturnValue(undefined);

      await expect(adapter.getJwtPrivateKey()).rejects.toThrow(
        'JWT_PRIVATE_KEY_PATH environment variable is not set',
      );
    });
  });

  describe('getJwtPublicKey', () => {
    it('should read and return the public key file content', async () => {
      const mockKey = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----';
      mockConfigGet.mockReturnValue('./keys/public.pem');
      (fs.readFileSync as jest.Mock).mockReturnValue(mockKey);

      const result = await adapter.getJwtPublicKey();

      expect(result).toBe(mockKey);
      expect(mockConfigGet).toHaveBeenCalledWith('JWT_PUBLIC_KEY_PATH');
      expect(fs.readFileSync).toHaveBeenCalledWith('./keys/public.pem', 'utf-8');
    });

    it('should throw when JWT_PUBLIC_KEY_PATH is not set', async () => {
      mockConfigGet.mockReturnValue(undefined);

      await expect(adapter.getJwtPublicKey()).rejects.toThrow(
        'JWT_PUBLIC_KEY_PATH environment variable is not set',
      );
    });
  });
});
