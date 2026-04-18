export {
  EMAIL_PROVIDER,
  type EmailProvider,
  type OutboundEmail,
  type SendResult,
} from './email-provider.interface.js';
export { EmailService } from './email.service.js';
export {
  EmailModule,
  type EmailModuleOptions,
  type EmailProviderKind,
} from './email.module.js';
export { ConsoleEmailProvider } from './providers/console-email.provider.js';
export { SesEmailProvider } from './providers/ses-email.provider.js';
