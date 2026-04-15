# Node.js Quickstart

## Install

```bash
npm install @wave-connect/sso-sdk
```

## Setup

```typescript
import { SSOClient } from '@wave-connect/sso-sdk';

const sso = new SSOClient({
  domain: 'sso.wave-connect.com',
  clientId: 'your_client_id',
  clientSecret: 'your_client_secret',
});
```

## Express Middleware

```typescript
import express from 'express';

const app = express();

// Protect all routes
app.use(sso.authenticate());

app.get('/api/profile', (req, res) => {
  res.json({ user: req.user });
});
```

## Permission Checks

```typescript
const result = await sso.check({
  user: 'user:abc123',
  relation: 'can_edit',
  object: 'document:doc456',
});

if (result.allowed) {
  // User can edit the document
}
```
