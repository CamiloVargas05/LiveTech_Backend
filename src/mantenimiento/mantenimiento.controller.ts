// mantenimiento.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MantenimientoService } from './mantenimiento.service';
import { CreateMantenimientoDto } from './dto/create-mantenimiento.dto';
import { UpdateMantenimientoDto } from './dto/update-mantenimiento.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('mantenimiento')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MantenimientoController {
  constructor(private readonly mantenimientoService: MantenimientoService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('foto'))
  crear(
    @Body() crearMantenimientoDto: CreateMantenimientoDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    foto?: Express.Multer.File,
  ) {
    return this.mantenimientoService.crear(crearMantenimientoDto, foto);
  }
  

@Post(':id/finalizar')
@Roles(UserRole.TECNICO)
finalizarMantenimiento(@Param('id') id: string, @Request() req) {
  return this.mantenimientoService.finalizarMantenimiento(id, req.user.sub);
}

  @Get()
  @Roles(UserRole.ADMIN)
  encontrarTodos() {
    return this.mantenimientoService.encontrarTodos();
  }

  @Get('mis-mantenimientos')
  encontrarPorToken(@Request() req) {
    console.log('🔍 req.user:', req.user);
    return this.mantenimientoService.encontrarPorToken(req.user.sub, req.user.role);
  }

  @Get(':id')
  encontrarUno(@Param('id') id: string) {
    return this.mantenimientoService.encontrarUno(id);
  }

  

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('foto'))
  actualizar(
    @Param('id') id: string,
    @Body() actualizarMantenimientoDto: UpdateMantenimientoDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    foto?: Express.Multer.File,
  ) {
    return this.mantenimientoService.actualizar(id, actualizarMantenimientoDto, foto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  eliminar(@Param('id') id: string) {
    return this.mantenimientoService.eliminar(id);
  }

  @Post(':id/iniciar')
  @Roles(UserRole.TECNICO)
  iniciarMantenimiento(@Param('id') id: string, @Request() req) {
    return this.mantenimientoService.iniciarMantenimiento(id, req.user.sub);
  }
}