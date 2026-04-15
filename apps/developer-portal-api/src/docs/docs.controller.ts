import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Documentation')
@Controller('api/v1/docs')
export class DocsController {
  @Get('sdks')
  @ApiOperation({ summary: 'List available SDKs with versions' })
  getSdks() {
    return {
      sdks: [
        {
          language: 'node',
          name: '@wave-connect/sso-sdk',
          version: '1.0.0',
          package_manager: 'npm',
          install: 'npm install @wave-connect/sso-sdk',
          docs_url: '/api/v1/docs/sdks/node',
        },
        {
          language: 'go',
          name: 'github.com/wave-connect/sso-sdk-go',
          version: '1.0.0',
          package_manager: 'go modules',
          install: 'go get github.com/wave-connect/sso-sdk-go',
          docs_url: '/api/v1/docs/sdks/go',
        },
      ],
    };
  }

  @Get('sdks/:language')
  @ApiOperation({ summary: 'Get SDK documentation for a language' })
  getSdkDocs(@Param('language') language: string) {
    const docs: Record<string, object> = {
      node: {
        language: 'node',
        title: 'Node.js / TypeScript SDK',
        quickstart: `
import { SSOClient } from '@wave-connect/sso-sdk';

const client = new SSOClient({
  domain: 'sso.wave-connect.com',
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
});

// Verify a token
const claims = await client.verifyPublicToken(token);

// Express middleware
app.use(client.authenticate());

// Check permissions (ReBAC)
const allowed = await client.check({
  user: 'user:abc123',
  relation: 'can_edit',
  object: 'document:doc456',
});
        `.trim(),
        features: [
          'PASETO v4.public token verification',
          'PASETO v4.local token decryption',
          'Express/Koa middleware',
          'ReBAC permission checks',
          'Token introspection',
          'TypeScript types included',
        ],
      },
      go: {
        language: 'go',
        title: 'Go SDK',
        quickstart: `
import ssosdk "github.com/wave-connect/sso-sdk-go"

client := &ssosdk.Client{
    Domain:       "sso.wave-connect.com",
    ClientID:     "your_client_id",
    ClientSecret: "your_client_secret",
}

// Verify a token
claims, err := client.VerifyPublicToken(ctx, tokenStr)

// HTTP middleware
r.Use(client.Middleware())

// Check permissions (ReBAC)
allowed, err := client.Check(ctx, ssosdk.CheckRequest{
    User:     "user:abc123",
    Relation: "can_edit",
    Object:   "document:doc456",
})
        `.trim(),
        features: [
          'PASETO v4.public token verification',
          'PASETO v4.local token decryption',
          'Fiber/Echo/Chi/stdlib middleware',
          'ReBAC permission checks',
          'Token introspection',
        ],
      },
    };

    return docs[language] ?? { error: 'SDK not found' };
  }

  @Get('examples/:type')
  @ApiOperation({ summary: 'Get code examples' })
  getExample(@Param('type') type: string) {
    const examples: Record<string, object> = {
      'verify-token': {
        title: 'Verify an Access Token',
        node: "const claims = await client.verifyPublicToken(req.headers.authorization.split(' ')[1]);",
        go: 'claims, err := client.VerifyPublicToken(ctx, tokenStr)',
      },
      'check-permission': {
        title: 'Check a ReBAC Permission',
        node: "const allowed = await client.check({ user: 'user:123', relation: 'can_edit', object: 'doc:456' });",
        go: "allowed, err := client.Check(ctx, ssosdk.CheckRequest{User: \"user:123\", Relation: \"can_edit\", Object: \"doc:456\"})",
      },
    };

    return examples[type] ?? { error: 'Example not found' };
  }
}
