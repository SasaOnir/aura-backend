import { IsEmail, IsString, MinLength, IsIn, MaxLength, IsOptional } from 'class-validator';

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
