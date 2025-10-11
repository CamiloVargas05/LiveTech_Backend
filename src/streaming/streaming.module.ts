import { Module } from '@nestjs/common';
import { StreamingService } from './streaming.service';
import { StreamingController } from './streaming.controller';

@Module({
  controllers: [StreamingController],
  providers: [StreamingService],
})
export class StreamingModule {}
