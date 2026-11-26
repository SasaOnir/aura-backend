import { SetMetadata, applyDecorators } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const PERMISSIONS_MODE_KEY = 'permissionsMode';
export type PERMISSIONS_MODE = 'all' | 'any';

/**
 * @RequirePermissions('users.suspend')
 * @RequirePermissions(['users.read', 'users.export'], 'any')
 *
 * I permessi sono controllati lato server dal PermissionsGuard.
 */
export const RequirePermissions = (perms: string | string[], mode: PERMISSIONS_MODE = 'all') =>
  applyDecorators(
    SetMetadata(PERMISSIONS_KEY, Array.isArray(perms) ? perms : [perms]),
    SetMetadata(PERMISSIONS_MODE_KEY, mode),
  );
