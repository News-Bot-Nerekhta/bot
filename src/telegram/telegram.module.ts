import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscriber } from './entities/subscriber.entity';
import { TelegramService } from './telegram.service';
@Module({
    imports: [
      TypeOrmModule.forFeature([Subscriber]),
    ],
    providers: [TelegramService],
    exports: [TelegramService],
  })
export class TelegramModule {}