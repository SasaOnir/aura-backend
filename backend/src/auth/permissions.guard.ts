import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from './permissions.service';
import { PERMISSIONS_KEY, PERMISSIONS_MODE, PERMISSIONS_MODE_KEY } from './require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger('PermissionsGuard');

  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const mode = this.reflector.getAllAndOverride<PERMISSIONS_MODE>(PERMISSIONS_MODE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]) || 'all';

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { id: string } | undefined;
    if (!user?.id) throw new ForbiddenException('Non autenticato.');

    if (mode === 'any') {
      await this.permissions.assertAny(user.id, required);
    } else {
      await this.permissions.assertAll(user.id, required);
    }
    return true;
  }
}

