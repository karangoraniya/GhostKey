import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

export async function awsTests(t, load, { advance }) {
  const ghosts = await load('lib/broker/ghostIdentity');
  const caps = await load('lib/capabilities/index');
  const { createS3Provider, MAX_OBJECT_BYTES } = await load('lib/providers/aws/client');
  const credentials = await load('lib/providers/aws/credentials');
  const ledger = await load('lib/ledger/keyring');
  let loads = 0, calls = 0, destroyed = 0, afterLoad;
  let response = () => ({ Contents: [{ Key: 'demo/hello.txt', Size: 5, LastModified: new Date(0), extra: 'omit' }] });
  const provider = createS3Provider({ load: async () => { loads++; afterLoad?.(); return { region: 'eu-west-1', credentials: { accessKeyId: 'fake-access-id', secretAccessKey: 'fake-secret-key', sessionToken: 'fake-session-token' }, verified() {} }; }, client: () => ({ send: async command => { calls++; assert.ok(command instanceof ListObjectsV2Command || command instanceof GetObjectCommand); assert.equal(command.input.Bucket, 'ghostkey-demo'); return response(command); }, destroy() { destroyed++; } }) });
  const make = (actions = ['aws.s3.list', 'aws.s3.read'], ttlSeconds = 900) => {
    const ghost = ghosts.createGhostIdentity({ name: 'aws-test', ttlSeconds: 1800 });
    const cap = caps.createCapability({ ghostId: ghost.id, provider: 'aws', bucket: 'ghostkey-demo', actions, ttlSeconds });
    return { ghost, cap, input: { ghostId: ghost.id, capabilityId: cap.id, bucket: 'ghostkey-demo' } };
  };
  await t.test('AWS list returns safe bounded metadata through the official command', async () => {
    const { input } = make();
    response = command => { assert.equal(command.input.MaxKeys, 100); assert.equal(command.input.Prefix, 'demo/'); return { Contents: [{ Key: 'demo/hello.txt', Size: 5, LastModified: new Date(0), secret: 'omit' }], IsTruncated: true }; };
    assert.deepEqual(await provider.listS3Objects({ ...input, prefix: 'demo/' }), { objects: [{ key: 'demo/hello.txt', size: 5, lastModified: new Date(0).toISOString(), etag: undefined }], truncated: true });
  });
  await t.test('AWS read returns small UTF-8 text and destroys client', async () => {
    response = () => ({ Body: Readable.from([Buffer.from('hello')]), ContentType: 'text/plain', ContentLength: 5 });
    const before = destroyed;
    assert.deepEqual(await provider.getS3Object({ ...make().input, key: 'demo/hello.txt' }), { key: 'demo/hello.txt', contentType: 'text/plain', size: 5, text: 'hello' });
    assert.equal(destroyed, before + 1);
  });
  for (const [name, code, mutate] of [
    ['wrong bucket', 'RESOURCE_NOT_ALLOWED', x => { x.input.bucket = 'another-bucket'; }],
    ['expired capability', 'CAPABILITY_EXPIRED', () => advance(901000)],
    ['expired ghost', 'GHOST_EXPIRED', x => ghosts.expireGhostIdentity(x.ghost.id)],
    ['revoked capability', 'CAPABILITY_REVOKED', x => caps.revokeCapability(x.cap.id)],
    ['wrong ghost', 'GHOST_MISMATCH', x => { x.input.ghostId = make().ghost.id; }],
  ]) await t.test(`AWS ${name} rejected before credentials or SDK`, async () => {
    const x = make(); mutate(x); const before = [loads, calls];
    await assert.rejects(provider.listS3Objects(x.input), { code }); assert.deepEqual([loads, calls], before);
  });
  await t.test('AWS wrong provider rejected before decryption', async () => {
    const x = make(); const github = caps.createCapability({ ghostId: x.ghost.id, provider: 'github', owner: 'owner', repo: 'repo', actions: ['github.repo.read'], ttlSeconds: 900 });
    const before = [loads, calls]; await assert.rejects(provider.listS3Objects({ ...x.input, capabilityId: github.id }), { code: 'PROVIDER_NOT_ALLOWED' }); assert.deepEqual([loads, calls], before);
  });
  await t.test('AWS write/delete cannot be granted or authorized; read needs its own action', async () => {
    const { input, ghost } = make(['aws.s3.list']); const before = [loads, calls];
    for (const action of ['aws.s3.write', 'aws.s3.delete']) {
      assert.throws(() => caps.validateCapability({ ...input, provider: 'aws', action }), { code: 'ACTION_NOT_ALLOWED' });
      assert.throws(() => caps.createCapability({ ghostId: ghost.id, provider: 'aws', bucket: input.bucket, actions: [action], ttlSeconds: 900 }), { code: 'ACTION_NOT_ALLOWED' });
    }
    await assert.rejects(provider.getS3Object({ ...input, key: 'hello.txt' }), { code: 'ACTION_NOT_ALLOWED' }); assert.deepEqual([loads, calls], before);
  });
  await t.test('AWS revocation during decryption prevents SDK call', async () => {
    const x = make(), before = calls; afterLoad = () => caps.revokeCapability(x.cap.id);
    try { await assert.rejects(provider.listS3Objects(x.input), { code: 'CAPABILITY_REVOKED' }); assert.equal(calls, before); } finally { afterLoad = undefined; }
  });
  for (const [name, data, code] of [
    ['declared large', () => ({ ContentLength: MAX_OBJECT_BYTES + 1, Body: Readable.from(['x']), ContentType: 'text/plain' }), 'AWS_OBJECT_TOO_LARGE'],
    ['actual large without length', () => ({ Body: Readable.from([Buffer.alloc(MAX_OBJECT_BYTES), Buffer.from('x')]), ContentType: 'text/plain' }), 'AWS_OBJECT_TOO_LARGE'],
    ['binary MIME', () => ({ Body: Readable.from(['x']), ContentType: 'image/png' }), 'AWS_OBJECT_NOT_TEXT'],
    ['invalid UTF8', () => ({ Body: Readable.from([Buffer.from([255])]), ContentType: 'text/plain' }), 'AWS_OBJECT_NOT_TEXT'],
    ['binary controls', () => ({ Body: Readable.from([Buffer.from([0])]), ContentType: 'text/plain' }), 'AWS_OBJECT_NOT_TEXT'],
    ['compressed', () => ({ Body: Readable.from(['x']), ContentType: 'text/plain', ContentEncoding: 'gzip' }), 'AWS_OBJECT_NOT_TEXT'],
    ['credential reflection', () => ({ Body: Readable.from(['fake-secret-key']), ContentType: 'text/plain' }), 'AWS_REQUEST_FAILED'],
  ]) await t.test(`AWS ${name} rejected safely`, async () => {
    const dataValue = data(); response = () => dataValue;
    await assert.rejects(provider.getS3Object({ ...make().input, key: 'hello.txt' }), { code }); assert.equal(dataValue.Body.destroyed, true);
  });
  await t.test('AWS raw SDK error is never returned', async () => {
    response = () => { const error = new Error('fake-secret-key'); error.name = 'InvalidAccessKeyId'; throw error; };
    await assert.rejects(provider.listS3Objects(make().input), { code: 'AWS_AUTH_FAILED' });
  });
  await t.test('AWS credential storage uses separate Ledger keys and status never decrypts', async () => {
    delete globalThis.ghostkeyAws;
    assert.equal(credentials.awsStatus().configured, false);
    await assert.rejects(credentials.loadAwsCredentialsForInternalUse(), { code: 'AWS_NOT_CONFIGURED' });
    await credentials.storeAwsCredentials({ accessKeyId: 'test-access', secretAccessKey: 'test-secret', sessionToken: 'test-session', region: 'eu-west-1' });
    const before = ledger.loads;
    assert.deepEqual(credentials.awsStatus(), { configured: true, region: 'eu-west-1', verifiedAt: null }); assert.equal(ledger.loads, before);
    assert.equal(JSON.stringify(globalThis.ghostkeyAws).includes('test-secret'), false);
    const config = await credentials.loadAwsCredentialsForInternalUse(); assert.equal(config.credentials.secretAccessKey, 'test-secret');
    config.verified(); assert.ok(credentials.awsStatus().verifiedAt);
  });
  await t.test('AWS routes reject delete without credential loading and MCP lists both providers', async () => {
    const x = make(); const route = await load('app/api/aws/s3/demo-blocked/route'); const before = ledger.loads;
    const response = await route.POST(new Request('http://127.0.0.1/api/aws/s3/demo-blocked', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(x.input) }));
    assert.equal(response.status, 403); assert.deepEqual(await response.json(), { success: false, error: 'ACTION_NOT_ALLOWED' }); assert.equal(ledger.loads, before);
    caps.createCapability({ ghostId: x.ghost.id, provider: 'github', owner: 'owner', repo: 'repo', actions: ['github.repo.read'], ttlSeconds: 900 });
    const { outputSchemas } = await load('mcp/contracts');
    const result = outputSchemas.ghost_capabilities.parse({ capabilities: caps.listGhostCapabilities(x.ghost.id) }); assert.equal(result.capabilities.length, 2);
  });
  delete globalThis.ghostkeyAws;
}
