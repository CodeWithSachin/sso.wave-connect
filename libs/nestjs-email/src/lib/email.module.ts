import { DynamicModule, Module, Provider } from '@nestjs/common';
import { EMAIL_PROVIDER, type EmailProvider } from './email-provider.interface.js';
import { EmailService } from './email.service.js';
import { ConsoleEmailProvider } from './providers/console-email.provider.js';
import { SesEmailProvider } from './providers/ses-email.provider.js';

/**
 * Environment-keyed provider name. Each consuming app reads its own env var
 * (e.g. process.env.EMAIL_PROVIDER) and passes the decision to
 * `EmailModule.forRoot({ provider })`. Keeping the registry in one place here
 * prevents drift across admin-api, identity-service (future Nest wrapper),
 * and the webhook / directory services.
 */
export type EmailProviderKind = 'console' | 'ses';

export interface EmailModuleOptions {
  provider: EmailProviderKind;
}

/**
 * Root module — only the app's composition root should import this and pass
 * the provider selection. Feature modules should re-import the lightweight
 * `EmailModule` (via `.forFeature()`) to pick up the `EmailService` binding
 * without reconfiguring the provider.
 */
@Module({})
export class EmailModule {
  static forRoot(options: EmailModuleOptions): DynamicModule {
    const providerBinding: Provider = {
      provide: EMAIL_PROVIDER,
      useClass: resolveProviderClass(options.provider),
    };

    return {
      module: EmailModule,
      global: true,
      providers: [
        ConsoleEmailProvider,
        SesEmailProvider,
        providerBinding,
        EmailService,
      ],
      exports: [EmailService, EMAIL_PROVIDER],
    };
  }
}

function resolveProviderClass(kind: EmailProviderKind): new (...args: never[]) => EmailProvider {
  switch (kind) {
    case 'console':
      return ConsoleEmailProvider;
    case 'ses':
      return SesEmailProvider;
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unknown EMAIL_PROVIDER kind: ${exhaustive as string}`);
    }
  }
}
