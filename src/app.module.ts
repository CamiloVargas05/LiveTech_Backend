import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TicketsModule } from './tickets/tickets.module';
import { ChatModule } from './chat/chat.module';
import { StreamingModule } from './streaming/streaming.module';
import { StatsModule } from './stats/stats.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    // Configuración de variables de entorno
    ConfigModule.forRoot({
      isGlobal: true, // Hace que ConfigModule esté disponible globalmente
      envFilePath: '.env',
    }),

    // Configuración de TypeORM con MySQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        //host: configService.get('DB_HOST'),
        //port: configService.get('DB_PORT'),
        //username: configService.get('DB_USERNAME'),
        //password: configService.get('DB_PASSWORD'),
        //database: configService.get('DB_DATABASE'),
        url: process.env.DATABASE_URL,
        schema: configService.get('DB_SCHEMA', 'public'),


        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: true, // ⚠️ Solo en desarrollo, en producción usar migraciones
        logging: false, // Ver las consultas SQL en la consola
      }),
    }),

    AuthModule,
    UsersModule,
    TicketsModule,
    ChatModule,
    StreamingModule,
    StatsModule,
    UploadsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}