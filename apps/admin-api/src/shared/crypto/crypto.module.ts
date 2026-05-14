import { Global, Module } from '@nestjs/common';
import { AesGcmService } from './aes-gcm.service';

@Global()
@Module({
  providers: [AesGcmService],
  exports: [AesGcmService],
})
export class CryptoModule {}
