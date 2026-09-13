import { BrokerError } from "./errors";
import type { Repository } from "@/types/broker";

export function text(value: unknown, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new BrokerError("INVALID_INPUT", 400);
  return value;
}
export function ttl(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 86400) throw new BrokerError("INVALID_TTL", 400);
  return value;
}
export function repository(owner: unknown, repo: unknown): Repository {
  if (typeof owner !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(owner) ||
      typeof repo !== "string" || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..") {
    throw new BrokerError("INVALID_RESOURCE", 400);
  }
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase() };
}
