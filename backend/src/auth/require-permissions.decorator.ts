import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissionsMode';
export type PERMISSIONS_MODE = 'all' | 'any';

/**
 * @RequirePermissions('users.suspend')
 * @RequirePermissions(['users.read', 'users.export'], 'any')
 *
 * PRD §5: "I permessi sono controllati lato server." — Il PermissionsGuard
 * verifica lato backend; il frontend nasconde solo i bottoni.
 */
export const RequirePermissions = (
  perms: string | string[],
  mode: PERMISSIONS_MODE = 'all',
): MethodDecorator => {
  const permsArr = Array.isArray(perms) ? perms : [perms];
  return (target: any, propertyKey: string | symbol | undefined, descriptor: PropertyDescriptor | undefined) => {
    SetMetadata(PERMISSIONS_KEY, permsArr)(target, propertyKey!, descriptor!);
    SetMetadata(PERMISSIONS_MODE_KEY, mode)(target, propertyKey!, descriptor!);
  };
};

