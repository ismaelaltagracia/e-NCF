import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as any;
  };

  it('should allow super_admin access', () => {
    const context = createMockContext({
      tipo: 'usuario',
      empresa_id: '',
      rnc: '',
      rol: 'super_admin',
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny regular admin access with 403', () => {
    const context = createMockContext({
      tipo: 'usuario',
      empresa_id: 'some-id',
      rnc: '101000001',
      rol: 'admin',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should deny facturador access with 403', () => {
    const context = createMockContext({
      tipo: 'usuario',
      empresa_id: 'some-id',
      rnc: '101000001',
      rol: 'facturador',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException if no user', () => {
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should deny api_key access', () => {
    const context = createMockContext({
      tipo: 'api_key',
      empresa_id: 'some-id',
      rnc: '101000001',
      api_key_id: 'key-id',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
