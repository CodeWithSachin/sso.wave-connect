// SSO Platform — Webhook Types (scaffold)

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  description?: string;
  subscribedEvents: string[];
  isActive: boolean;
  failureCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  tenantId: string;
  eventType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  httpStatusCode?: number;
  attemptNumber: number;
  createdAt: string;
}
