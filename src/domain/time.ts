/** Integer number of seconds since the Unix epoch; the only timestamp format on the wire. */
export type UnixEpochSeconds = number;

/** Supplies the current time, injectable so tests can control expiry behavior. */
export type Clock = () => UnixEpochSeconds;
