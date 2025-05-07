import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telegraf, Markup } from 'telegraf';
import { Subscriber } from './entities/subscriber.entity';
import { InputMediaPhoto } from 'telegraf/types';

@Injectable()
export class TelegramService {
  private bot: Telegraf;
  private readonly logger = new Logger(TelegramService.name);

  private readonly categories = {
    power: 'Отключение электроснабжения',
    water: 'Отключение воды',
    other: 'Другие новости',
    all: 'Все новости',
  };

  constructor(
    @InjectRepository(Subscriber)
    private subscriberRepository: Repository<Subscriber>,
  ) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error(
        'TELEGRAM_BOT_TOKEN не установлен в переменных окружения',
      );
    }
    this.bot = new Telegraf(token);
    this.initializeBot();
  }

  private async getCategoryButtons(telegram_id: number) {
    const subscriber = await this.subscriberRepository.findOne({
      where: { telegram_id: telegram_id.toString() },
    });

    const subscribedCategories = subscriber?.categories || [];

    return Object.entries(this.categories).map(([key, name]) => {
      const isSubscribed = subscribedCategories.includes(key);
      const emoji = isSubscribed ? '✅' : '❌';
      return Markup.button.callback(`${emoji} ${name}`, `toggle_${key}`);
    });
  }

  private initializeBot() {
    this.bot.command('start', async (ctx) => {
      const welcomeMessage =
        '👋 Добро пожаловать в бота новостей города Нерехта!\n\n' +
        'Этот бот будет присылать вам уведомления о новых новостях с официального сайта администрации\n\n' +
        'Доступные команды:\n' +
        '• /subscribe - Управление подписками\n' +
        '• /about - Информация о боте\n\n';

      await ctx.reply(welcomeMessage);
    });

    this.bot.command('subscribe', async (ctx) => {
      const buttons = await this.getCategoryButtons(ctx.from.id);

      await ctx.reply(
        'Управление подписками на категории новостей:\n✅ - включено, ❌ - выключено',
        Markup.inlineKeyboard(buttons, { columns: 1 }),
      );
    });

    this.bot.action(/toggle_(.+)/, async (ctx) => {
      const telegram_id = ctx.from.id;
      const category = ctx.match[1];

      let subscriber = await this.subscriberRepository.findOne({
        where: { telegram_id: telegram_id.toString() },
      });

      if (!subscriber) {
        subscriber = await this.subscriberRepository.save({
          telegram_id: telegram_id.toString(),
          categories: [category],
        });
      } else {
        const isSubscribed = subscriber.categories.includes(category);

        if (category === 'all') {
          if (isSubscribed) {
            subscriber.categories = [];
            await ctx.answerCbQuery('🔕 Отключены все уведомления');
          } else {
            subscriber.categories = Object.keys(this.categories);
            await ctx.answerCbQuery('🔔 Включены все уведомления');
          }
        } else {
          if (isSubscribed) {
            subscriber.categories = subscriber.categories.filter(
              (cat) => cat !== category,
            );
            subscriber.categories = subscriber.categories.filter(
              (cat) => cat !== 'all',
            );
            await ctx.answerCbQuery(
              `🔕 Отключены уведомления: ${this.categories[category]}`,
            );
          } else {
            subscriber.categories.push(category);
            const allCategoriesExceptAll = Object.keys(this.categories).filter(
              (cat) => cat !== 'all',
            );
            const hasAllCategories = allCategoriesExceptAll.every((cat) =>
              subscriber?.categories.includes(cat),
            );
            if (hasAllCategories) {
              subscriber.categories.push('all');
            }
            await ctx.answerCbQuery(
              `🔔 Включены уведомления: ${this.categories[category]}`,
            );
          }
        }

        await this.subscriberRepository.save(subscriber);
      }

      const buttons = await this.getCategoryButtons(telegram_id);
      await ctx.editMessageReplyMarkup(
        Markup.inlineKeyboard(buttons, { columns: 1 }).reply_markup,
      );
    });

    this.bot.command('about', async (ctx) => {
      const aboutMessage =
        '📱 Бот новостей города Нерехта\n\n' +
        'Версия: 1.0.0\n' +
        'Бот автоматически отслеживает новости на официальном сайте администрации ' +
        'и отправляет их подписчикам.\n\n';

      await ctx.reply(aboutMessage);
    });

    this.bot.launch();
  }

  async notifySubscribers(message: string, category: string = 'all') {
    const subscribers = await this.subscriberRepository.find();

    for (const subscriber of subscribers) {
      try {
        if (
          subscriber.categories.includes(category) ||
          subscriber.categories.includes('all')
        ) {
          let cleanMessage = message
            .replace(/📷 Изображения:[\s\S]*?(?=\n\n|$)/, '')
            .trim();
          cleanMessage = cleanMessage.replace(/\n{2,}/g, '\n\n');

          const imageUrls =
            message.match(/(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif))/gi) || [];

          if (imageUrls.length === 0) {
            await this.bot.telegram.sendMessage(
              subscriber.telegram_id,
              cleanMessage,
            );
          } else if (imageUrls.length === 1) {
            await this.bot.telegram.sendPhoto(
              subscriber.telegram_id,
              imageUrls[0],
              {
                caption: cleanMessage,
              },
            );
          } else {
            const media = imageUrls.map((url, index) => ({
              type: 'photo' as const,
              media: url,
              caption: index === 0 ? cleanMessage : undefined,
            }));

            await this.bot.telegram.sendMediaGroup(
              subscriber.telegram_id,
              media,
            );
          }
        }
      } catch (error) {
        this.logger.error(
          `Ошибка при отправке сообщения подписчику ${subscriber.telegram_id}:`,
          error,
        );
      }
    }
  }

  async notifySubscribersWithMedia(
    text: string,
    imageUrls: string[],
    category?: string,
  ): Promise<void> {
    const subscribers = await this.getSubscribers(category);

    for (const chatId of subscribers) {
      try {
        if (imageUrls.length === 0) {
          await this.bot.telegram.sendMessage(chatId, text);
        } else if (imageUrls.length === 1) {
          await this.bot.telegram.sendPhoto(chatId, imageUrls[0], {
            caption: text,
          });
        } else {
          const media: InputMediaPhoto[] = imageUrls.map((url, index) => ({
            type: 'photo',
            media: url,
            caption: index === 0 ? text : undefined,
          }));

          await this.bot.telegram.sendMediaGroup(chatId, media);
        }
      } catch (error) {
        this.logger.error(
          `Ошибка при отправке сообщения в чат ${chatId}:`,
          error,
        );
      }
    }
  }

  private async getSubscribers(category: string = 'all'): Promise<string[]> {
    const subscribers = await this.subscriberRepository.find();
    return subscribers
      .filter(
        (sub) =>
          sub.categories.includes(category) || sub.categories.includes('all'),
      )
      .map((sub) => sub.telegram_id);
  }
}
