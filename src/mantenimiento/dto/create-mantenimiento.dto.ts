// crear-mantenimiento.dto.ts
import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class CreateMantenimientoDto {
  @IsString()
  @IsNotEmpty()
  nombreEquipo: string;

  @IsString()
  @IsNotEmpty()
  marca: string;

  @IsString()
  @IsNotEmpty()
  modelo: string;

  @IsString()
  @IsNotEmpty()
  descripcionProblema: string;

  @IsUUID()
  @IsNotEmpty()
  usuarioId: string;

  @IsUUID()
  @IsNotEmpty()
  tecnicoId: string;
}