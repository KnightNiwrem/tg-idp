/**
 * Output streams of the CLI. Raw credential strings go to `stdout` for clean shell capture; status
 * notices, expiry timestamps, and reminders go to `stderr`.
 */
export interface CliOutput {
  writeCredential(credential: string): void;
  writeNotice(notice: string): void;
}
