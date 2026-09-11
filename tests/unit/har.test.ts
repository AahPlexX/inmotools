import { describe, expect, it } from 'vitest';
import * as harEngine from '../../src/tools/har/har-engine';

const { analyzeHar, buildWaterfallRows, decodeBase64Body, readBody, sanitizeHar } = harEngine;

function makeHar() {
  return { log: { entries: [{
    startedDateTime:'2026-08-29T12:00:00.000Z', time:120,
    request:{ method:'POST', url:'https://alice:request-pass@api.example.test/orders?token=query-secret&safe=visible&urlOnlySecret=url-secret', headers:[{name:'Authorization',value:'Bearer top-secret-token'},{name:'X-Trace',value:'trace-safe'}], queryString:[{name:'token',value:'query-secret'},{name:'safe',value:'visible'}], cookies:[{name:'session',value:'session-secret'}], postData:{ mimeType:'application/x-www-form-urlencoded', text:'username=ada&password=form-secret&safe=visible' } },
    response:{ status:302, redirectURL:'https://bob:redirect-pass@redirect.example.test/next?access_token=redirect-secret&safe=yes', headers:[{name:'Set-Cookie',value:'session=session-secret'},{name:'Content-Type',value:'application/json'}], cookies:[{name:'session',value:'session-secret'}], content:{ mimeType:'application/json', text:JSON.stringify({access_token:'response-secret',ok:true}) } },
    timings:{blocked:-1,dns:5,connect:15,ssl:8,send:2,wait:70,receive:28},
  }] } };
}

describe('HAR sanitizer', () => {
  it('finds headers, cookies, URL/query values, URL credentials, redirect credentials, form bodies, and response JSON without echoing values', () => {
    const analysis=analyzeHar(makeHar());
    expect(analysis.findings.map(f=>f.field)).toEqual(expect.arrayContaining([
      'request.query:token',
      'request.query:urlOnlySecret',
      'request.url:username',
      'request.url:password',
      'response.redirectURL:username',
      'response.redirectURL:password',
      'response.redirectURL.query:access_token',
      'request.body:password',
      'response.body:access_token',
    ]));
    const serialized=JSON.stringify(analysis);
    for(const secret of ['query-secret','url-secret','request-pass','redirect-pass','redirect-secret','form-secret','response-secret','top-secret-token']) expect(serialized).not.toContain(secret);
  });

  it('redacts credentials across request URL, redirect URL, form text, and response JSON', async () => {
    const result=await sanitizeHar(makeHar(),{mode:'redact',categories:{headers:true,cookies:true,query:true,bodies:true}});
    const text=JSON.stringify(result.har);
    for(const secret of ['query-secret','url-secret','request-pass','redirect-pass','redirect-secret','form-secret','response-secret','top-secret-token','session-secret']) expect(text).not.toContain(secret);
    expect(text).toContain('safe=visible');
    expect(text).toContain('safe=yes');
    expect(result.changedFindings.length).toBeGreaterThan(0);
    expect(result.remainingFindings).toEqual([]);
    expect(result.outputFindings.some(f=>f.field==='response.body:access_token')).toBe(true);
  });

  it('reports only deliberately unselected credential locations as remaining risk', async () => {
    const result=await sanitizeHar(makeHar(),{mode:'redact',categories:{headers:true,cookies:false,query:false,bodies:false}});
    expect(result.remainingFindings.length).toBeGreaterThan(0);
    expect(result.remainingFindings.every(f=>f.category!=='headers')).toBe(true);
    expect(result.remainingFindings.map(f=>f.field)).toContain('request.url:password');
    expect(result.changedFindings.every(f=>f.category==='headers')).toBe(true);
  });

  it('hashes deterministically and supports a custom mask', async () => {
    const policy={mode:'hash' as const,categories:{headers:true,cookies:true,query:true,bodies:true}};
    expect((await sanitizeHar(makeHar(),policy)).har).toEqual((await sanitizeHar(makeHar(),policy)).har);
    const masked=await sanitizeHar(makeHar(),{mode:'mask',mask:'CUSTOM-MASK',categories:{headers:true,cookies:true,query:true,bodies:true}});
    expect(JSON.stringify(masked.har)).toContain('CUSTOM-MASK');
  });

  it('preserves unsafe integer JSON lexemes through parse, sanitize, and export', async () => {
    const parseHarJson=(harEngine as unknown as {parseHarJson:(text:string)=>any}).parseHarJson;
    const stringifyHarJson=(harEngine as unknown as {stringifyHarJson:(value:unknown,space?:number)=>string}).stringifyHarJson;
    const source='{"log":{"version":"1.2","_captureId":9007199254740993,"entries":[{"request":{"url":"https://example.test/","headers":[],"cookies":[],"queryString":[]},"response":{"headers":[],"cookies":[],"content":{"mimeType":"application/json","text":"{\\"eventId\\":9007199254740993,\\"access_token\\":\\"body-secret\\"}"}}}]}}';
    const parsed=parseHarJson(source);
    const result=await sanitizeHar(parsed,{mode:'redact',categories:{headers:true,cookies:true,query:true,bodies:true}});
    const serialized=stringifyHarJson(result.har,2);
    expect(serialized.match(/9007199254740993/g)).toHaveLength(2);
    expect(serialized).not.toContain('9007199254740992');
    expect(serialized).not.toContain('body-secret');
  });

  it('preserves unsupported exponent numeric lexemes instead of rounding or converting them to null', async () => {
    const parseHarJson=(harEngine as unknown as {parseHarJson:(text:string)=>any}).parseHarJson;
    const stringifyHarJson=(harEngine as unknown as {stringifyHarJson:(value:unknown,space?:number)=>string}).stringifyHarJson;
    const source='{"log":{"version":"1.2","_unsafeExponent":9007199254740993e0,"_hugeExponent":1e400,"entries":[]}}';
    const result=await sanitizeHar(parseHarJson(source),{mode:'redact',categories:{headers:false,cookies:false,query:false,bodies:false}});
    const serialized=stringifyHarJson(result.har);
    expect(serialized).toContain('9007199254740993e0');
    expect(serialized).toContain('1e400');
    expect(serialized).not.toContain('9007199254740992');
    expect(serialized).not.toContain('null');
  });

  it('preserves a literal __proto__ member as ordinary JSON data during cloning', async () => {
    const parseHarJson=(harEngine as unknown as {parseHarJson:(text:string)=>any}).parseHarJson;
    const stringifyHarJson=(harEngine as unknown as {stringifyHarJson:(value:unknown,space?:number)=>string}).stringifyHarJson;
    const parsed=parseHarJson('{"log":{"version":"1.2","__proto__":{"safe":"kept"},"entries":[]}}');
    const result=await sanitizeHar(parsed,{mode:'redact',categories:{headers:false,cookies:false,query:false,bodies:false}});
    expect(Object.prototype.hasOwnProperty.call(result.har.log,'__proto__')).toBe(true);
    expect(stringifyHarJson(result.har)).toContain('"__proto__":{"safe":"kept"}');
  });

  it('does not double-count SSL inside connect in waterfall phases', () => {
    const row=buildWaterfallRows(makeHar())[0];
    expect(row.phases).toMatchObject({blocked:0,dns:5,connect:7,ssl:8,send:2,wait:70,receive:28});
    expect(row.phases.connect+row.phases.ssl).toBe(15);
  });
});

describe('base64 bodies', () => {
  const secretBody=JSON.stringify({user:'ada',access_token:'super-secret-value'});
  const base64Har={log:{entries:[{request:{headers:[],cookies:[],queryString:[],postData:{mimeType:'application/json',encoding:'base64',text:btoa(secretBody)}},response:{headers:[],cookies:[]}}]}};
  it('reports and sanitizes credentials while preserving base64 transport', async () => {
    expect(analyzeHar(base64Har).findings.some(f=>f.field==='request.body:access_token')).toBe(true);
    const {har}=await sanitizeHar(base64Har,{mode:'redact',categories:{headers:false,cookies:false,query:false,bodies:true}});
    expect(JSON.stringify(har)).not.toContain('super-secret-value');
    expect(JSON.parse(atob(har.log.entries[0].request.postData.text)).user).toBe('ada');
    expect(har.log.entries[0].request.postData.encoding).toBe('base64');
  });

  it('treats a mislabelled encoding as plain text', () => {
    expect(decodeBase64Body('not base64 at all!!')).toBeUndefined();
    expect(readBody({encoding:'base64',text:'not base64 at all!!'}).wasBase64).toBe(false);
  });
});

it('round-trips significant decimal digits and underflow without changing valid numeric metadata', () => {
  const source = '{"exact":0.123456789012345678901,"tiny":1e-400,"ordinary":0.125,"scientific":1.25e2}';
  const parsed = harEngine.parseHarJson(source);
  const output = harEngine.stringifyHarJson(parsed);
  expect(output).toContain('0.123456789012345678901');
  expect(output).toContain('1e-400');
  expect(parsed.ordinary).toBe(0.125);
  expect(parsed.scientific).toBe(125);
});

it('uses protected decimal timings for the waterfall while preserving their exact lexeme', () => {
  const parsed = harEngine.parseHarJson('{"log":{"entries":[{"startedDateTime":"2026-01-01T00:00:00Z","time":123.456789012345678901,"timings":{"wait":123.456789012345678901}}]}}');
  const row = harEngine.buildWaterfallRows(parsed)[0];
  expect(row.totalMs).toBeCloseTo(123.45678901234568);
  expect(row.phases.wait).toBeCloseTo(123.45678901234568);
  expect(harEngine.stringifyHarJson(parsed)).toContain('123.456789012345678901');
});
