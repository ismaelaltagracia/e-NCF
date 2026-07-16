import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKey } from '../../../database/entities/api-key.entity.js';
import { Empresa } from '../../../database/entities/empresa.entity.js';
import { EstadoEmpresa } from '../../../database/enums.js';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let apiKeyRepo: jest.Mocked<Partial<Repository<ApiKey>>>;

  const rawApiKey = 'test-api-key-value-12345';
  const keyHash = createHash('sha256').update(rawApiKey).digest('hex');

  const mockEmpresa: Partial<Empresa> = {
    id: 'empresa-uuid-1',
    rnc: '101234567',
    nombre: 'Test Empresa',
    estado: EstadoEmpresa.ACTIVO,
  };

  const mockApiKey: Partial<ApiKey> = {
    id: 'apikey-uuid-1',
    empresa_id: 'empresa-uuid-1',
    empresa: mockEmpresa as Empresa,
    nombre: 'Test Key',
    key_hash: keyHash,
    scopes: ['facturas:crear', 'facturas:leer'],
    activo: true,
    last_used_at: null,
    created_at: new Date(),
  };

  function createMockExecutionContext(headers: Record<string, string> = {}) {
    const request = { headers, user: undefined as unknown };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as import('@nestjs/common').ExecutionContext;
  }

  beforeEach(async () => {
    apiKeyRepo = {
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyGuard,
        {
          provide: getRepositoryToken(ApiKey),
          useValue: apiKeyRepo,
        },
      ],
    }).compile();

    guard = module.get<ApiKeyGuard>(ApiKeyGuard);
  });

  it('should allow access with a valid API key and build correct RequestContext', async () => {
    apiKeyRepo.findOne!.mockResolvedValue(mockApiKey);

    const context = createMockExecutionContext({ 'x-api-key': rawApiKey });
    const result = await guard.canActivate(context);

    expect(result).toBe(true);

    const request = context.switchToHttp().getRequest();
    expect(request.user).toEqual({
      tipo: 'api_key',
      empresa_id: 'empresa-uuid-1',
      rnc: '101234567',
      api_key_id: 'apikey-uuid-1',
      scopes: ['facturas:crear', 'facturas:leer'],
    });
  });

  it('should throw 401 when X-API-Key header is missing', async () => {
    const context = createMockExecutionContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('API key requerida'),
    );
  });

  it('should throw 401 when API key does not exist in database', async () => {
    apiKeyRepo.findOne!.mockResolvedValue(null);

    const context = createMockExecutionContext({ 'x-api-key': 'nonexistent-key' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('API key inválida'),
    );
  });

  it('should throw 401 when API key is revoked (activo=false)', async () => {
    const revokedKey = { ...mockApiKey, activo: false } as ApiKey;
    apiKeyRepo.findOne!.mockResolvedValue(revokedKey);

    const context = createMockExecutionContext({ 'x-api-key': rawApiKey });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('API key inválida'),
    );
  });

  it('should throw 401 when Empresa estado is not activo', async () => {
    const inactiveEmpresa = { ...mockEmpresa, estado: EstadoEmpresa.INACTIVO } as Empresa;
    const keyWithInactiveEmpresa = { ...mockApiKey, empresa: inactiveEmpresa } as ApiKey;
    apiKeyRepo.findOne!.mockResolvedValue(keyWithInactiveEmpresa);

    const context = createMockExecutionContext({ 'x-api-key': rawApiKey });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('API key inválida'),
    );
  });

  it('should update last_used_at after successful validation', async () => {
    apiKeyRepo.findOne!.mockResolvedValue(mockApiKey);

    const context = createMockExecutionContext({ 'x-api-key': rawApiKey });
    await guard.canActivate(context);

    expect(apiKeyRepo.update).toHaveBeenCalledWith(
      'apikey-uuid-1',
      expect.objectContaining({ last_used_at: expect.any(Date) }),
    );
  });

  it('should look up the key by SHA-256 hash', async () => {
    apiKeyRepo.findOne!.mockResolvedValue(mockApiKey);

    const context = createMockExecutionContext({ 'x-api-key': rawApiKey });
    await guard.canActivate(context);

    expect(apiKeyRepo.findOne).toHaveBeenCalledWith({
      where: { key_hash: keyHash },
      relations: ['empresa'],
    });
  });
});
