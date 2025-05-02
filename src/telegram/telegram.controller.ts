import { Controller, Post, Body } from '@nestjs/common';
import { TelegramService } from './telegram.service';

interface NewsPayload {
  title: string;
  content: string;
  category: string;
}

@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegramService: TelegramService) {}

  @Post('news')
  async handleNews(@Body() news: NewsPayload) {
    const message = `${news.title}\n\n${news.content}`;
    await this.telegramService.notifySubscribers(news.title, message, news.category);
    return { success: true };
  }
}
