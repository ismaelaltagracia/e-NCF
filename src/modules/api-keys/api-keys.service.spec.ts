import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';

import { ApiKeysService } from './api-keys.service.js';
import { ApiKey } from '../../database/entities/api-key.entity.js';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let mockRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };

  beforeEach(async () => {
    mockRepo = {
      create: jest.fn((data) => ({ ...data, id: 'generated-uuid' })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: entity.id ?? 'generated-uuid', created_at: new Date() }),
      ),
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('create', () => {
    it('should generate a 256-bit key and store its SHA-256 hash', async () => {
      const result = await service.create('empresa-1', 'Test Key', ['facturas:read']);

      expect(result.key).toBeDefined();
      expect(result.id).toBe('generated-uuid');

      // Key should be 32 bytes (256 bits) encoded as base64
      const keyBuffer = Buffer.from(result.key, 'base64');
      expect(keyBuffer.length).toBe(32);

      // Verify the hash stored matches SHA-256 of the raw key
      const expectedHash = createHash('sha256').update(result.key).digest('hex');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresa_id: 'empresa-1',
          nombre: 'Test Key',
          key_hash: expectedHash,
          scopes: ['facturas:read'],
          activo: true,
        }),
      );
      expect(mockRepo.save).toHaveBeenCalled();
    });

    it('should create key with multiple scopes', async () => {
      const scopes = ['facturas:write', 'facturas:read', 'pdf:read'];
      await service.create('empresa-1', 'Multi-scope', scopes);

      expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ scopes }));
    });
  });

  describe('listByEmpresa', () => {
    it('should return keys without key_hash', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          nombre: 'Key 1',
          key_hash: 'some-hash',
          scopes: ['facturas:read'],
          activo: true,
          created_at: new Date('2024-01-01'),
          last_used_at: null,
          empresa_id: 'empresa-1',
        },
        {
          id: 'key-2',
          nombre: 'Key 2',
          key_hash: 'another-hash',
          scopes: ['pdf:read'],
          activo: false,
          created_at: new Date('2024-01-02'),
          last_used_at: new Date('2024-06-01'),
          empresa_id: 'empresa-1',
        },
      ];

      mockRepo.find.mockResolvedValue(mockKeys);

      const result = await service.listByEmpresa('empresa-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'key-1',
        nombre: 'Key 1',
        scopes: ['facturas:read'],
        activo: true,
        created_at: new Date('2024-01-01'),
        last_used_at: null,
      });
      // Verify hash is not exposed
      expect(result[0]).not.toHaveProperty('key_hash');
      expect(result[1]).not.toHaveProperty('key_hash');

      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { empresa_id: 'empresa-1' },
        order: { created_at: 'ASC' },
      });
    });

    it('should return empty array when no keys exist', async () => {
      mockRepo.find.mockResolvedValue([]);

      const result = await service.listByEmpresa('empresa-1');

      expect(result).toEqual([]);
    });
  });

  describe('rotate', () => {
    it('should revoke existing key and create new one with same name and scopes', async () => {
      const existingKey = {
        id: 'key-1',
        empresa_id: 'empresa-1',
        nombre: 'My Key',
        key_hash: 'old-hash',
        scopes: ['facturas:read', 'pdf:read'],
        activo: true,
      };

      mockRepo.findOne.mockResolvedValue(existingKey);
      mockRepo.save.mockImplementation((entity) =>
        Promise.resolve({ ...entity, id: entity.id ?? 'new-key-id', created_at: new Date() }),
      );
      mockRepo.create.mockImplementation((data) => ({ ...data, id: 'new-key-id' }));

      const result = await service.rotate('key-1', 'empresa-1');

      // First save: revoke old key
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'key-1', activo: false }),
      );

      // Should create new key with same name and scopes
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empresa_id: 'empresa-1',
          nombre: 'My Key',
          scopes: ['facturas:read', 'pdf:read'],
          activo: true,
        }),
      );

      expect(result.key).toBeDefined();
      expect(result.id).toBe('new-key-id');
    });

    it('should throw NotFoundException when key does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.rotate('nonexistent', 'empresa-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-tenant access', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'key-1',
        empresa_id: 'empresa-2',
        nombre: 'Other Key',
        scopes: ['facturas:read'],
        activo: true,
      });

      await expect(service.rotate('key-1', 'empresa-1', 'corr-123')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('revoke', () => {
    it('should set activo to false', async () => {
      const existingKey = {
        id: 'key-1',
        empresa_id: 'empresa-1',
        nombre: 'My Key',
        key_hash: 'some-hash',
        scopes: ['facturas:read'],
        activo: true,
      };

      mockRepo.findOne.mockResolvedValue(existingKey);

      await service.revoke('key-1', 'empresa-1');

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'key-1', activo: false }),
      );
    });

    it('should throw NotFoundException when key does not exist', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.revoke('nonexistent', 'empresa-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-tenant access', async () => {
      mockRepo.findOne.mockResolvedValue({
        id: 'key-1',
        empresa_id: 'empresa-other',
        nombre: 'Other Key',
        scopes: [],
        activo: true,
      });

      await expect(service.revoke('key-1', 'empresa-1', 'corr-456')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
