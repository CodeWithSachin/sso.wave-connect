// SSO Platform — Webhook Types

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
  status: 'pending' | 'delivered' | 'failed' | 'retrying';
  httpStatusCode?: number;
  attemptNumber: number;
  createdAt: string;
}

// Event types dispatched to webhook-service
export const WebhookEventTypes = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_LOGIN: 'user.login',
  USER_MFA_ENROLLED: 'user.mfa_enrolled',
  MEMBERSHIP_CREATED: 'membership.created',
  MEMBERSHIP_DELETED: 'membership.deleted',
  GROUP_CREATED: 'group.created',
  GROUP_UPDATED: 'group.updated',
  GROUP_MEMBER_ADDED: 'group.member_added',
  GROUP_MEMBER_REMOVED: 'group.member_removed',
  PERMISSION_GRANTED: 'permission.granted',
  PERMISSION_REVOKED: 'permission.revoked',
  SESSION_CREATED: 'session.created',
  SESSION_REVOKED: 'session.revoked',
} as const;

export type WebhookEventType =
  (typeof WebhookEventTypes)[keyof typeof WebhookEventTypes];

export interface WebhookDispatchRequest {
  tenantId: string;
  eventType: WebhookEventType;
  data: Record<string, unknown>;
}

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  tenant_id: string;
  data: Record<string, unknown>;
}
