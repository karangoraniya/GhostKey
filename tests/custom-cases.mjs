import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
export async function customTests(t, load, { advance }) {
  const connections = await load('lib/providers/custom/connections');
  const { parseConnection, executeSchema } = await load('lib/providers/custom/config');
  const network = await load('lib/providers/custom/network');
  const { createCustomProvider } = await load('lib/providers/custom/client');
  const ghosts = await load('lib/broker/ghostIdentity');
  const caps = await load('lib/capabilities/index');
  const ledger = await load('lib/ledger/keyring');
  const secret = 'custom-fake-secret';
  const config = { name: 'Test API', baseUrl: 'https://api.example.com', auth: 'bearer', secret, operations: [{ name: 'projects', path: '/v1/projects' }, { name: 'profile', path: '/me' }] };
  const connection = await connections.createConnection(config);
  const make = (ttlSeconds = 900) => {
    const ghost = ghosts.createGhostIdentity({ name: 'custom-agent', ttlSeconds: 1800 });
    const cap = caps.createCapability({ ghostId: ghost.id, provider: 'custom', connectionId: connection.id, actions: ['custom.read.projects'], ttlSeconds });
    return { ghost, cap, input: { ghostId: ghost.id, capabilityId: cap.id, connectionId: connection.id, operation: 'projects' } };
  };
  let loads = 0, calls = 0, dns = 0, afterLoad;
  let output = { projects: [{ id: 1 }] };
  const provider = createCustomProvider({ resolve: async () => { dns++; return '8.8.8.8'; }, load: async id => { loads++; const auth = await connections.loadInternalAuthentication(id); afterLoad?.(); return auth; }, request: async (url, address, headers) => {
    calls++; assert.equal(url.href, 'https://api.example.com/v1/projects'); assert.equal(address, '8.8.8.8'); assert.equal(headers.Authorization, `Bearer ${secret}`); return output;
  } });
  await t.test('custom connection metadata excludes authentication and ciphertext', () => {
    assert.equal(JSON.stringify(connections.listConnections()).includes(secret), false);
    assert.deepEqual(Object.keys(connection).sort(), ['baseUrl', 'id', 'name', 'operations']);
    assert.equal(connection.operations[0].method, 'GET');
  });
  await t.test('custom GET succeeds with matching capability and named operation', async () => {
    assert.deepEqual(await provider(make().input), { operation: 'projects', data: output });
  });
  await t.test('custom destinations and header overrides fail closed', () => {
    for (const baseUrl of ['http://api.example.com','https://localhost','https://127.0.0.1','https://[::1]','https://api.example.com:444','https://user:pass@api.example.com','https://api.example.com/path','https://api.example.com/?secret=x','https://api.example.com/#x','https://host.internal']) assert.throws(() => parseConnection({ ...config, baseUrl }), { code: 'CUSTOM_URL_NOT_ALLOWED' });
    for (const headerName of ['Host','Cookie','Authorization','Proxy-Authorization','X-Forwarded-Host','X-HTTP-Method-Override']) assert.throws(() => parseConnection({ ...config, auth:'header', headerName }), { code: 'CUSTOM_HEADER_NOT_ALLOWED' });
    assert.equal(parseConnection({ ...config, auth:'header', headerName:'X-Api-Key' }).headerName, 'X-Api-Key');
  });
  await t.test('custom paths cannot override origin, traverse, encode, or carry queries', () => {
    for (const path of ['//evil.com','https://evil.com','/../secret','/a/./b','/%2e%2e','/a?key=x','/a#x','/projects/{id}','/a\\b']) assert.throws(() => parseConnection({ ...config, operations:[{name:'projects',path}] }), { code:'INVALID_CUSTOM_CONFIG' });
    assert.throws(() => parseConnection({ ...config, operations:[{name:'projects',path:'/projects',method:'POST'}] }), { code:'INVALID_CUSTOM_CONFIG' });
  });
  await t.test('custom DNS blocks all private/reserved addresses and mixed answers', async () => {
    for (const ip of ['0.1.2.3','10.1.2.3','100.64.0.1','127.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','192.0.2.2','198.18.0.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1']) assert.equal(network.publicIpv4(ip),false,ip);
    assert.equal(network.publicIpv4('8.8.8.8'),true);
    await assert.rejects(network.resolvePublicAddress('api.example.com', async()=>['8.8.8.8','127.0.0.1']), {code:'CUSTOM_URL_NOT_ALLOWED'});
    assert.equal(await network.resolvePublicAddress('api.example.com',async()=>['8.8.8.8']), '8.8.8.8');
  });
  for (const [name,code,mutate] of [
    ['ungranted operation','ACTION_NOT_ALLOWED',x=>{x.input.operation='profile';}],
    ['wrong connection','RESOURCE_NOT_ALLOWED',x=>{x.input.connectionId='api_'+'b'.repeat(48);}],
    ['expired grant','CAPABILITY_EXPIRED',()=>advance(901000)],
    ['expired ghost','GHOST_EXPIRED',x=>ghosts.expireGhostIdentity(x.ghost.id)],
    ['revoked grant','CAPABILITY_REVOKED',x=>caps.revokeCapability(x.cap.id)],
    ['wrong ghost','GHOST_MISMATCH',x=>{x.input.ghostId=make().ghost.id;}],
  ]) await t.test(`custom ${name} rejected before DNS, decryption or request`,async()=>{
    const x=make();mutate(x);const before=[loads,calls,dns];await assert.rejects(provider(x.input),{code});assert.deepEqual([loads,calls,dns],before);
  });
  await t.test('custom model cannot supply URLs, headers, body or method',async()=>{
    const x=make(), before=[loads,calls,dns];
    for(const extra of [{url:'https://evil.com'},{headers:{Host:'evil.com'}},{method:'DELETE'},{body:'x'},{query:{redirect:'evil'}}]) await assert.rejects(provider({...x.input,...extra}),{code:'INVALID_INPUT'});
    assert.deepEqual([loads,calls,dns],before);assert.equal(executeSchema.safeParse({...x.input,secret}).success,false);
    assert.throws(()=>caps.createCapability({ghostId:x.ghost.id,provider:'custom',connectionId:connection.id,actions:['custom.write.projects'],ttlSeconds:900}),{code:'ACTION_NOT_ALLOWED'});
  });
  await t.test('custom private DNS rejection never loads the key',async()=>{
    let touched=false;
    const blocked=createCustomProvider({resolve:()=>network.resolvePublicAddress('host',async()=>['127.0.0.1']),load:async()=>{touched=true;},request:async()=>{touched=true;}});
    await assert.rejects(blocked(make().input),{code:'CUSTOM_URL_NOT_ALLOWED'});assert.equal(touched,false);
  });
  await t.test('custom rechecks revocation after Ledger decrypts',async()=>{
    const x=make(), before=calls;afterLoad=()=>caps.revokeCapability(x.cap.id);
    try{await assert.rejects(provider(x.input),{code:'CAPABILITY_REVOKED'});assert.equal(calls,before);}finally{afterLoad=undefined;}
  });
  await t.test('custom refuses reflected secret in JSON values and keys',async()=>{
    for(const value of [{key:secret},{[secret]:'value'}]){output=value;await assert.rejects(provider(make().input),{code:'CUSTOM_UNSAFE_RESPONSE'});}
    output={ok:true};
  });
  function response(body, statusCode=200, headers={'content-type':'application/json'}){const stream=Readable.from([Buffer.from(body)]);stream.statusCode=statusCode;stream.headers=headers;return stream;}
  await t.test('custom response rejects redirect, non-JSON, compression, size and invalid UTF8',async()=>{
    for(const [stream,code] of [[response('{}',302),'CUSTOM_REDIRECT_BLOCKED'],[response('{}',401),'CUSTOM_AUTH_FAILED'],[response('<html>',200,{'content-type':'text/html'}),'CUSTOM_NOT_JSON'],[response('{}',200,{'content-type':'application/json','content-encoding':'gzip'}),'CUSTOM_NOT_JSON'],[response('x'.repeat(network.MAX_JSON_BYTES+1)),'CUSTOM_RESPONSE_TOO_LARGE'],[response(Buffer.from([255])),'CUSTOM_NOT_JSON']]){await assert.rejects(network.readJson(stream),{code});stream.destroy();}
  });
  await t.test('custom HTTPS transport pins DNS and never follows redirect',async()=>{
    let count=0;
    const transport=(url,options,callback)=>{
      count++;assert.equal(url.hostname,'api.example.com');assert.equal(options.method,'GET');assert.equal(options.agent,false);assert.equal(options.family,4);
      options.lookup('api.example.com',{},(error,address,family)=>{assert.equal(error,null);assert.equal(address,'8.8.8.8');assert.equal(family,4);});
      const req=new EventEmitter();req.end=()=>queueMicrotask(()=>callback(response('{}',302)));req.destroy=()=>req;return req;
    };
    await assert.rejects(network.requestJson(new URL('https://api.example.com/projects'),'8.8.8.8',{},transport),{code:'CUSTOM_REDIRECT_BLOCKED'});assert.equal(count,1);
  });
  await t.test('custom connection replacement uses a new ID; metadata works through MCP',async()=>{
    const other=await connections.createConnection({...config,baseUrl:'https://other.example.com'});assert.notEqual(other.id,connection.id);
    const x=make();assert.equal(connections.getConnection(connection.id).baseUrl,config.baseUrl);
    const {outputSchemas}=await load('mcp/contracts');assert.equal(outputSchemas.ghost_capabilities.parse({capabilities:caps.listGhostCapabilities(x.ghost.id)}).capabilities[0].provider,'custom');
  });
  await t.test('custom routes reject cross-origin requests and injected execution fields',async()=>{
    const route=await load('app/api/custom/execute/route');const before=ledger.loads;
    for(const [origin,extra,code] of [['https://evil.com',{},'ORIGIN_NOT_ALLOWED'],['http://127.0.0.1',{url:'https://evil.com'},'INVALID_INPUT']]){
      const res=await route.POST(new Request('http://127.0.0.1/api/custom/execute',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({...make().input,...extra})}));assert.deepEqual(await res.json(),{success:false,error:code});
    }assert.equal(ledger.loads,before);
  });
}
