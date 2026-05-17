import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface WebhookEndpoint {
	id: string;
	url: string;
	description: string | null;
	subscribed_events: string[];
	is_active: boolean;
	failure_count: number;
	disabled_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface CreatedWebhookEndpoint {
	id: string;
	url: string;
	description?: string;
	subscribedEvents: string[];
	/** Plaintext signing secret — shown only at creation time, never again. */
	secret: string;
	isActive: boolean;
	createdAt: string;
}

export interface CreateWebhookPayload {
	url: string;
	description?: string;
	subscribedEvents: string[];
}

export interface WebhookDelivery {
	id: string;
	endpointId: string;
	eventType: string;
	status: string;
	statusCode: number | null;
	attempt: number;
	requestBody: string | null;
	responseBody: string | null;
	createdAt: string;
	completedAt: string | null;
	errorMessage: string | null;
}

export interface DeliveriesResponse {
	data: WebhookDelivery[];
	total: number;
}

/**
 * Wraps webhook-service `/api/v1/webhooks` endpoints. Calls go cross-origin
 * (developer-portal :4302 → webhook-service :3300) with the sso_session
 * cookie — webhook-service derives the tenant id from the cookie via
 * SessionCookieGuard, so we never pass tenant in the body.
 */
@Injectable({ providedIn: 'root' })
export class WebhooksService {
	private readonly http = inject(HttpClient);
	private readonly base = `${environment.webhookServiceUrl}/api/v1/webhooks`;

	list(page = 1, pageSize = 50): Observable<{ data: WebhookEndpoint[]; total: number }> {
		return this.http.get<{ data: WebhookEndpoint[]; total: number }>(this.base, {
			withCredentials: true,
			params: { page, pageSize },
		});
	}

	create(payload: CreateWebhookPayload): Observable<CreatedWebhookEndpoint> {
		return this.http.post<CreatedWebhookEndpoint>(this.base, payload, {
			withCredentials: true,
		});
	}

	delete(id: string): Observable<unknown> {
		return this.http.delete(`${this.base}/${id}`, { withCredentials: true });
	}

	listDeliveries(endpointId: string, page = 1, pageSize = 100): Observable<DeliveriesResponse> {
		return this.http.get<DeliveriesResponse>(`${this.base}/${endpointId}/deliveries`, {
			withCredentials: true,
			params: { page, pageSize },
		});
	}

	/** Re-enqueue a failed (or any) delivery for another retry attempt. */
	retryDelivery(endpointId: string, deliveryId: string): Observable<unknown> {
		return this.http.post(
			`${this.base}/${endpointId}/deliveries/${deliveryId}/retry`,
			{},
			{ withCredentials: true },
		);
	}
}
