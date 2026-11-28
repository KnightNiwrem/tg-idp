import type { IdpLimits } from '../config/idp-config.ts';
import type { Clock } from '../domain/time.ts';
import type { IdpRepository } from '../storage/idp-repository.ts';

/** Collaborators shared by the HTTP API and the Auth Bot. */
export interface IdpDependencies {
  readonly repository: IdpRepository;
  readonly limits: IdpLimits;
  readonly clock: Clock;
}
