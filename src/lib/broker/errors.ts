export class BrokerError extends Error {
  constructor(public readonly code: string, public readonly status = 403) {
    super(code);
    this.name = "BrokerError";
  }
}
