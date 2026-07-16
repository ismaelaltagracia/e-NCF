import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from './scopes.guard.js';
import type { RequestContext } from '../interfaces/request-context.interface.js';

describe('ScopesGuard', () => {
  let guard: ScopesGuard;
  let reflector: Reflector;

  function createMockContext(user?: RequestContext): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ScopesGuard(reflector);
  });

  it('should allow access when no scopes metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when scopes metadata is empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when request.user is not set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should skip scope check for JWT users (tipo=usuario)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'facturador',
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow API Key with matching scopes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:read', 'facturas:write', 'pdf:read'],
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow API Key with all required scopes when multiple are needed', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write', 'pdf:read']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:read', 'facturas:write', 'pdf:read'],
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should deny API Key missing required scope', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:read', 'pdf:read'],
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny API Key missing one of multiple required scopes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write', 'pdf:read']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:write'],
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny API Key with no scopes at all', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: [],
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny API Key with undefined scopes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should include missing scopes in error message', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturas:write', 'pdf:read']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:read'],
    };
    const ctx = createMockContext(user);
    try {
      guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect((e as ForbiddenException).message).toContain('facturas:write');
      expect((e as ForbiddenException).message).toContain('pdf:read');
    }
  });
});
