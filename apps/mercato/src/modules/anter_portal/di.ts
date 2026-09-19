import type { AppContainer } from '@open-mercato/shared/lib/di/container'

export function register(_container: AppContainer) {
  // No app-local services yet; cart/checkout logic resolves peer services on demand.
}

export default register
