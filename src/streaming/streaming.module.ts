// streaming/streaming.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StreamingGateway } from './streaming.gateway';
import { MantenimientoModule } from '../mantenimiento/mantenimiento.module';

@Module({
  imports: [
    MantenimientoModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [StreamingGateway],
  exports: [StreamingGateway],
})
export class StreamingModule {}