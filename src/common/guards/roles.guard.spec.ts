import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import type { RequestContext } from '../interfaces/request-context.interface.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
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
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when roles metadata is empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = createMockContext();
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw UnauthorizedException when request.user is not set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const ctx = createMockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('should skip role check for API Key users (tipo=api_key)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: RequestContext = {
      tipo: 'api_key',
      empresa_id: 'emp-1',
      rnc: '123456789',
      api_key_id: 'key-1',
      scopes: ['facturas:write'],
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow admin to access admin-restricted endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'admin',
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow admin to access facturador-restricted endpoint (hierarchy)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturador']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'admin',
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow admin to access lector-restricted endpoint (hierarchy)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['lector']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'admin',
    };
    const ctx = createMockContext(user);
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow facturador to access facturador-restricted endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturador']);
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

  it('should deny facturador access to admin-restricted endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'facturador',
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny lector access to admin-restricted endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'lector',
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should deny lector access to facturador-restricted endpoint', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['facturador']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
      rol: 'lector',
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no rol set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['admin']);
    const user: RequestContext = {
      tipo: 'usuario',
      empresa_id: 'emp-1',
      rnc: '123456789',
      usuario_id: 'usr-1',
    };
    const ctx = createMockContext(user);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
