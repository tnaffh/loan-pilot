import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** A transport that delivers one text message to an E.164 number. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, body: string): Promise<void>;
}

/** Development transport: writes the message to the log instead of sending it. */
class LogSmsProvider implements SmsProvider {
  readonly name = 'log';
  private readonly logger = new Logger('SmsLog');

  async send(to: string, body: string): Promise<void> {
    this.logger.log(`SMS to ${to}: ${body}`);
  }
}

/**
 * Outbound SMS (borrower sign-in codes). The vendor is chosen by `SMS_PROVIDER`;
 * none is wired yet, so every value falls back to the log transport — codes show
 * up in the API log, which is how local development signs in. Adding a vendor
 * (Twilio, Clickatell, BulkSMS…) means one `SmsProvider` class plus its keys.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;

  constructor(config: ConfigService) {
    const requested = config.get<string>('SMS_PROVIDER') ?? 'log';
    this.provider = new LogSmsProvider();
    if (requested !== 'log') {
      this.logger.warn(`SMS_PROVIDER "${requested}" is not implemented; logging messages instead.`);
    }
    if (config.get<string>('NODE_ENV') === 'production' && this.provider.name === 'log') {
      this.logger.warn(
        'No SMS vendor configured in production: borrower sign-in codes are only written to the log.',
      );
    }
  }

  send(to: string, body: string): Promise<void> {
    return this.provider.send(to, body);
  }
}
