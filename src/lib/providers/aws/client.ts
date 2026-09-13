import "server-only";
import { S3Client, ListObjectsV2Command, GetObjectCommand, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { validateCapability } from "@/lib/capabilities";
import { BrokerError } from "@/lib/broker/errors";
import { loadAwsCredentialsForInternalUse } from "./credentials";
import { bucketName, objectKey } from "./validation";

export const MAX_OBJECT_BYTES = 1024 * 1024;
type Scope = { ghostId: string; capabilityId: string; bucket: string };
type Dependencies = { load: typeof loadAwsCredentialsForInternalUse; client: (config: Awaited<ReturnType<typeof loadAwsCredentialsForInternalUse>>) => Pick<S3Client, "send" | "destroy"> };
async function readText(data: GetObjectCommandOutput, signal: AbortSignal) {
  const body = data.Body;
  if (!(body instanceof Readable)) throw new BrokerError("AWS_REQUEST_FAILED", 502);
  const abort = () => body.destroy(new Error("AWS_REQUEST_FAILED"));
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new BrokerError("AWS_REQUEST_FAILED", 502);
    if ((data.ContentLength ?? 0) > MAX_OBJECT_BYTES) throw new BrokerError("AWS_OBJECT_TOO_LARGE", 413);
    const contentType = data.ContentType?.split(";")[0].trim().toLowerCase() ?? "";
    if ((!contentType.startsWith("text/") && !["application/json", "application/xml", "application/yaml"].includes(contentType)) ||
        (data.ContentEncoding && data.ContentEncoding !== "identity")) throw new BrokerError("AWS_OBJECT_NOT_TEXT", 415);
    const chunks: Buffer[] = []; let size = 0;
    for await (const chunk of body) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_OBJECT_BYTES) throw new BrokerError("AWS_OBJECT_TOO_LARGE", 413);
      chunks.push(bytes);
    }
    let text: string;
    try { text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
    catch { throw new BrokerError("AWS_OBJECT_NOT_TEXT", 415); }
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) throw new BrokerError("AWS_OBJECT_NOT_TEXT", 415);
    return { contentType, size, text };
  } finally { signal.removeEventListener("abort", abort); body.destroy(); }
}

// Injectable transport for tests; production always uses the official S3 SDK.
export function createS3Provider(deps: Dependencies) {
  async function execute<T>(input: Scope, action: "aws.s3.list" | "aws.s3.read", operation: (client: Pick<S3Client, "send" | "destroy">, signal: AbortSignal) => Promise<T>) {
    const policy = { ...input, provider: "aws", action };
    validateCapability(policy); // No credential access or SDK calls before authorization.
    let config: Awaited<ReturnType<typeof deps.load>> | undefined = await deps.load();
    let client: Pick<S3Client, "send" | "destroy"> | undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      validateCapability(policy); // Expiry/revocation may change while Ledger decrypts.
      client = deps.client(config);
      const result = await operation(client, controller.signal);
      validateCapability(policy); // Do not release data to authority that expired in flight.
      const encoded = JSON.stringify(result);
      if (Object.values(config.credentials).some(secret => secret && encoded.includes(secret))) throw new BrokerError("AWS_REQUEST_FAILED", 502);
      config.verified();
      return result;
    } catch (error) {
      if (error instanceof BrokerError) throw error;
      const name = error instanceof Error ? error.name : "";
      throw new BrokerError(["InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken", "InvalidToken"].includes(name) ? "AWS_AUTH_FAILED" : name === "AccessDenied" ? "AWS_BUCKET_NOT_ALLOWED" : "AWS_REQUEST_FAILED", 502);
    } finally { clearTimeout(timer); client?.destroy(); client = undefined; config = undefined; }
  }
  return {
    listS3Objects(input: Scope & { prefix?: string }) {
      const bucket = bucketName(input.bucket), prefix = objectKey(input.prefix ?? "", true);
      return execute({ ...input, bucket }, "aws.s3.list", async (client, signal) => {
        const data = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 100 }), { abortSignal: signal });
        return { objects: (data.Contents ?? []).slice(0, 100).map(item => ({ key: item.Key ?? "", size: item.Size ?? 0, lastModified: item.LastModified?.toISOString() ?? null, etag: item.ETag })), truncated: !!data.IsTruncated || (data.Contents?.length ?? 0) > 100 };
      });
    },
    getS3Object(input: Scope & { key: string }) {
      const bucket = bucketName(input.bucket), key = objectKey(input.key);
      return execute({ ...input, bucket }, "aws.s3.read", async (client, signal) => {
        const data = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
        return { key, ...await readText(data, signal) };
      });
    },
  };
}
const provider = createS3Provider({ load: loadAwsCredentialsForInternalUse,
  client: config => new S3Client({ region: config.region, credentials: config.credentials,
    maxAttempts: 1, followRegionRedirects: false, ignoreConfiguredEndpointUrls: true }) });
export const { listS3Objects, getS3Object } = provider;
