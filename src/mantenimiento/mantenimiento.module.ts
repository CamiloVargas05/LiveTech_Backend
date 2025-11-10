// mantenimiento.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MantenimientoService } from './mantenimiento.service';
import { MantenimientoController } from './mantenimiento.controller';
import { Mantenimiento } from './entities/mantenimiento.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Mantenimiento]),
    UsersModule,
  ],
  controllers: [MantenimientoController],
  providers: [MantenimientoService],
  exports: [MantenimientoService],
})
export class MantenimientoModule {}