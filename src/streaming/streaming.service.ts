import { Injectable } from '@nestjs/common';
import { CreateStreamingDto } from './dto/create-streaming.dto';
import { UpdateStreamingDto } from './dto/update-streaming.dto';

@Injectable()
export class StreamingService {
  create(createStreamingDto: CreateStreamingDto) {
    return 'This action adds a new streaming';
  }

  findAll() {
    return `This action returns all streaming`;
  }

  findOne(id: number) {
    return `This action returns a #${id} streaming`;
  }

  update(id: number, updateStreamingDto: UpdateStreamingDto) {
    return `This action updates a #${id} streaming`;
  }

  remove(id: number) {
    return `This action removes a #${id} streaming`;
  }
}
