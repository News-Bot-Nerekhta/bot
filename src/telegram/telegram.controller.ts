import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';

interface NewsPayload {
  content: string;
  category: string;
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('news')
  async handleNews(@Body() news: NewsPayload) {
    await this.telegramService.notifySubscribers(news.content, news.category);
    return { success: true };
  }
}
