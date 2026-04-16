import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface SdkInfo {
  language: string;
  name: string;
  version: string;
  packageManager: string;
  installCommand: string;
  docsUrl: string;
}

export interface CodeExample {
  type: string;
  title: string;
  description: string;
  examples: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class DocsService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.devPortalApiUrl}/api/v1/docs`;

  getSdks() {
    return this.http.get<SdkInfo[]>(`${this.baseUrl}/sdks`);
  }

  getExample(type: string) {
    return this.http.get<CodeExample>(`${this.baseUrl}/examples/${type}`);
  }
}
