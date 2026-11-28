/**
 * Thrown by skeleton functions whose behavior is described in OUTLINE.md but not yet implemented.
 */
export class NotImplementedError extends Error {
  /** Name of the missing capability, usually the stubbed function's name. */
  readonly capability: string;

  constructor(capability: string) {
    super(`Not implemented: ${capability}`);
    this.capability = capability;
    this.name = 'NotImplementedError';
  }
}

/**
 * Marks a skeleton function body as unimplemented by throwing {@link NotImplementedError}.
 *
 * Stubs pass their parameters as `stubInputs` so the parameters count as used until the real
 * implementation lands; the inputs are deliberately discarded (never logged or attached to the
 * error) because some, such as bot tokens, are secrets.
 */
export function notImplemented(capability: string, ...stubInputs: unknown[]): never {
  void stubInputs;
  throw new NotImplementedError(capability);
}
