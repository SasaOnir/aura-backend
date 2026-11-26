import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'auditAction';

/**
 * @Audit('user.suspend')  // marca l'endpoint per audit automatico
 *
 * L'AuditInterceptor legge action, resourceType (da @AuditResource) e
 * resourceId (param :id), cattura previous/new value e scrive in audit_logs
 * con actor = req.user.id, ip, user-agent.
 *
 * PRD §4.6: ogni operazione amministrativa importante deve registrare
 * "Chi ha operato, Che cosa ha fatto, Quando, Su quale elemento,
 *  Valore precedente, Nuovo valore, Motivazione, Risultato, IP, sessione".
 */
export const Audit = (action: string) => SetMetadata(AUDIT_KEY, action);

export const AUDIT_RESOURCE_KEY = 'auditResource';
export const AuditResource = (resourceType: string) =>
  SetMetadata(AUDIT_RESOURCE_KEY, resourceType);
