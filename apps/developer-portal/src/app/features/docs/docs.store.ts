import { inject } from '@angular/core';
import { signalStore, withState, withMethods, withHooks, patchState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';
import { DocsService, SdkInfo, CodeExample } from './docs.service';

interface DocsState {
  sdks: SdkInfo[];
  examples: CodeExample[];
  loading: boolean;
}

export const DocsStore = signalStore(
  withState<DocsState>({
    sdks: [],
    examples: [],
    loading: true,
  }),
  withMethods((store) => {
    const svc = inject(DocsService);
    return {
      async loadDocs() {
        patchState(store, { loading: true });
        try {
          const sdks = await firstValueFrom(svc.getSdks());
          patchState(store, { sdks: Array.isArray(sdks) ? sdks : [], loading: false });
        } catch {
          patchState(store, { loading: false });
        }

        // Load examples separately
        try {
          const [verifyToken, checkPerm] = await Promise.all([
            firstValueFrom(svc.getExample('verify-token')),
            firstValueFrom(svc.getExample('check-permission')),
          ]);
          patchState(store, { examples: [verifyToken, checkPerm].filter(Boolean) as CodeExample[] });
        } catch {
          // Examples may not be available
        }
      },
    };
  }),
  withHooks({
    onInit(store) { store.loadDocs(); },
  }),
);
