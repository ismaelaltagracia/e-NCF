import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import type { RequestContext } from '../interfaces/request-context.interface.js';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestContext | undefined;

    if (!user) {
      throw new UnauthorizedException('No autenticado');
    }

    if (user.rol !== 'super_admin') {
      throw new ForbiddenException(
        'Acceso denegado: solo Super Administradores pueden acceder a este recurso',
      );
    }

    return true;
  }
}
