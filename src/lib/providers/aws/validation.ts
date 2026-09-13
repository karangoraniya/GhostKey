import { BrokerError } from "@/lib/broker/errors";

// General-purpose buckets only; no ARNs, access points, or caller-supplied endpoints.
export function bucketName(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value) ||
      value.includes("..") || /^\d+\.\d+\.\d+\.\d+$/.test(value) || /(?:-s3alias|--ol-s3|--x-s3|--table-s3)$/.test(value)) {
    throw new BrokerError("INVALID_RESOURCE", 400);
  }
  return value;
}
export function objectKey(value: unknown, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.length) || Buffer.byteLength(value) > 1024 || /[\x00-\x1f\x7f]/.test(value)) throw new BrokerError("INVALID_INPUT", 400);
  return value;
}
export function awsRegion(value: unknown): string {
  if (typeof value !== "string" || !/^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(value) || value.length > 40) throw new BrokerError("AWS_NOT_CONFIGURED", 503);
  return value;
}
