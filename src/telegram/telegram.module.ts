import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from './entities/subscriber.entity';

@Module({
    imports: [
      TypeOrmModule.forFeature([Subscriber]),
    ]
  })
export class TelegramModule {}