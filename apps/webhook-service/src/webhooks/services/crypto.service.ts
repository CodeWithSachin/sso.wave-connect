import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';

@Injectable()
export class CryptoService {
  generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  sign(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  verify(payload: string, secret: string, signature: string): boolean {
    const expected = this.sign(payload, secret);
    return expected === signature;
  }
}
