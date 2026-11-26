import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AUDIT_KEY, AUDIT_RESOURCE_KEY } from './audit.decorator';
import { clientIp } from '../common/client-ip';
import { isUUID } from 'class-validator';

/**
 * AuditInterceptor — scrive in audit_logs per ogni endpoint decorato con @Audit.
 * PRD §4.6: ogni operazione amministrativa importante deve registrare
 * actor, action, resource, result, ip, user-agent.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AuditInterceptor');

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    const action = this.reflector.getAllAndOverride<string>(AUDIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const resourceType = this.reflector.getAllAndOverride<string>(AUDIT_RESOURCE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!action) return next.handle();

    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { id: string } | undefined;
    const ip = clientIp(req);
    const ua = req.headers['user-agent'];

    // resourceId: dal path param 'id' (convenzione), o dal body, o null
    // Solo UUID validi: un valore diverso farebbe fallire l'INSERT e l'evento non verrebbe registrato.
    const candidate: unknown = req.params?.id || req.body?.id || req.params?.userId;
    const resourceId: string | undefined = typeof candidate === 'string' && isUUID(candidate) ? candidate : undefined;

    return next.handle().pipe(
      tap({
        next: () => this.writeLog({ actorId: user?.id, action, resourceType, resourceId, ip, ua, result: 'success' }),
        error: (err) =>
          this.writeLog({ actorId: user?.id, action, resourceType, resourceId, ip, ua, result: err.status === 403 ? 'denied' : 'failure', reason: err.message?.slice(0, 500) }),
      }),
    );
  }

  private async writeLog(data: {
    actorId?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    ip?: string;
    ua?: string;
    result: 'success' | 'failure' | 'denied';
    reason?: string;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: data.actorId as any,
          action: data.action,
          resourceType: data.resourceType || 'unknown',
          resourceId: data.resourceId as any,
          result: data.result,
          reason: data.reason,
          ip: data.ip as any,
          userAgent: data.ua,
        },
      });
    } catch (e) {
      // L'audit non deve mai bloccare l'azione; logghiamo solo.
      this.logger.error(`Audit write failed: ${(e as Error).message}`);
    }
  }
}
