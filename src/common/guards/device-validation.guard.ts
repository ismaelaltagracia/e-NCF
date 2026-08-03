import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispositivo } from '../../database/entities/dispositivo.entity.js';

/**
 * Guard que valida el dispositivo Print Bridge en cada request.
 * 
 * Si el request incluye header X-Device-Id:
 * - Verifica que el dispositivo existe y está activo
 * - Verifica que pertenece a la misma empresa del token/API Key
 * - Actualiza ultima_actividad (heartbeat implícito)
 * - Si no es válido → 403
 * 
 * Si NO incluye X-Device-Id, deja pasar (es un request normal de portal/app).
 */
@Injectable()
export class DeviceValidationGuard implements CanActivate {
  constructor(
    @InjectRepository(Dispositivo)
    private readonly dispositivoRepo: Repository<Dispositivo>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const deviceId = request.headers['x-device-id'];

    // Si no envía device ID, no es un Print Bridge → dejar pasar
    if (!deviceId) return true;

    // Obtener empresa_id del usuario autenticado
    const user = request.user;
    if (!user?.empresa_id) return true;

    // Verificar dispositivo
    const dispositivo = await this.dispositivoRepo.findOne({
      where: { id: deviceId, empresa_id: user.empresa_id },
    });

    if (!dispositivo) {
      throw new ForbiddenException(
        'Dispositivo no registrado. Registre este equipo desde Configuración.',
      );
    }

    if (!dispositivo.activo) {
      throw new ForbiddenException(
        'Dispositivo desactivado. Reactívelo desde el portal web o contacte al administrador.',
      );
    }

    // Actualizar última actividad (heartbeat implícito)
    // Uso update directo para no bloquear el request
    this.dispositivoRepo.update(
      { id: deviceId },
      { ultima_actividad: new Date() },
    ).catch(() => {}); // Non-blocking

    return true;
  }
}
