import { PartialType } from '@nestjs/mapped-types';
import { CreateStreamingDto } from './create-streaming.dto';

export class UpdateStreamingDto extends PartialType(CreateStreamingDto) {}
