import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;
  
  // NO tiene "role" ni "isActive" - usuario solo puede editar nombre y teléfono
}