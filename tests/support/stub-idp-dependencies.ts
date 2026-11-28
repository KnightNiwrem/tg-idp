import { DEFAULT_IDP_LIMITS } from '../../src/config/idp-config.ts';
import type { IdpDependencies } from '../../src/idp/idp-dependencies.ts';
import { notImplemented } from '../../src/not-implemented.ts';
import type { IdpRepository } from '../../src/storage/idp-repository.ts';

/** Repository whose every method throws; for tests that must not touch storage. */
const unusableRepository: IdpRepository = {
  insertPendingRegistration: (...inputs) => notImplemented('insertPendingRegistration', inputs),
  findRegistration: (...inputs) => notImplemented('findRegistration', inputs),
  confirmRegistration: (...inputs) => notImplemented('confirmRegistration', inputs),
  findManagementKey: (...inputs) => notImplemented('findManagementKey', inputs),
  deleteManagementKey: (...inputs) => notImplemented('deleteManagementKey', inputs),
  recordManagementTokenUse: (...inputs) => notImplemented('recordManagementTokenUse', inputs),
  listServiceKeys: (...inputs) => notImplemented('listServiceKeys', inputs),
  findServiceKey: (...inputs) => notImplemented('findServiceKey', inputs),
  upsertServiceKey: (...inputs) => notImplemented('upsertServiceKey', inputs),
  deleteServiceKey: (...inputs) => notImplemented('deleteServiceKey', inputs),
  deleteAllServiceKeys: (...inputs) => notImplemented('deleteAllServiceKeys', inputs),
  purgeExpiredRecords: (...inputs) => notImplemented('purgeExpiredRecords', inputs),
  isHealthy: () => notImplemented('isHealthy'),
};

/** Fixed time used by tests: 2024-11-28T00:00:00Z. */
export const FIXED_TEST_TIME = 1_732_752_000;

/** IdP dependencies with default limits, a fixed clock, and a repository that must not be used. */
export function createStubIdpDependencies(): IdpDependencies {
  return {
    repository: unusableRepository,
    limits: DEFAULT_IDP_LIMITS,
    clock: () => FIXED_TEST_TIME,
  };
}
