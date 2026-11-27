import { IsEmail, IsString, MinLength, IsIn, MaxLength, IsOptional, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  // La policy completa (comuni, email/nome contenuti, varietà) è in common/password-policy.ts
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName: string;

  @IsIn(['listener', 'artist', 'label'])
  accountType: 'listener' | 'artist' | 'label';
}

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(200)
  refreshToken: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  refreshToken?: string;
}

export class TokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

export class EmailOnlyDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class SetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}

const CODE = /^\d{6}$/;
const RECOVERY = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{8}$/;

export class MfaVerifyDto {
  @IsString()
  @MaxLength(2000)
  mfaToken: string;

  @IsOptional()
  @Matches(CODE, { message: 'Il codice ha 6 cifre.' })
  code?: string;

  @IsOptional()
  @Matches(RECOVERY, { message: 'Codice di recupero non valido.' })
  recoveryCode?: string;
}

export class MfaCodeDto {
  @Matches(CODE, { message: 'Il codice ha 6 cifre.' })
  code: string;
}

export class MfaDisableDto {
  @IsString()
  @MaxLength(128)
  password: string;

  @Matches(CODE, { message: 'Il codice ha 6 cifre.' })
  code: string;
}
