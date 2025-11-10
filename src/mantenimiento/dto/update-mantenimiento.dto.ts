// actualizar-mantenimiento.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { EstadoMantenimiento } from '../entities/mantenimiento.entity';

export class UpdateMantenimientoDto {
  @IsString()
  @IsOptional()
  nombreEquipo?: string;

  @IsString()
  @IsOptional()
  marca?: string;

  @IsString()
  @IsOptional()
  modelo?: string;

  @IsString()
  @IsOptional()
  descripcionProblema?: string;

  @IsEnum(EstadoMantenimiento)
  @IsOptional()
  estado?: EstadoMantenimiento;
}