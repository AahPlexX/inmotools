import { describe, expect, it } from 'vitest';
import { analyzeHar, buildWaterfallRows, decodeBase64Body, readBody, sanitizeHar } from '../../src/tools/har/har-engine';

function makeHar() {
  return { log: { entries: [{
    startedDateTime:'2026-08-29T12:00:00.000Z', time:120,
    request:{ method:'POST', url:'https://api.example.test/orders?token=query-secret&safe=visible&urlOnlySecret=url-secret', headers:[{name:'Authorization',value:'Bearer top-secret-token'},{name:'X-Trace',value:'trace-safe'}], queryString:[{name:'token',value:'query-secret'},{name:'safe',value:'visible'}], cookies:[{name:'session',value:'session-secret'}], postData:{ mimeType:'application/x-www-form-urlencoded', text:'username=ada&password=form-secret&safe=visible' } },
    response:{ status:200, headers:[{name:'Set-Cookie',value:'session=session-secret'},{name:'Content-Type',value:'application/json'}], cookies:[{name:'session',value:'session-secret'}], content:{ mimeType:'application/json', text:JSON.stringify({access_token:'response-secret',ok:true}) } },
    timings:{blocked:-1,dns:5,connect:15,ssl:8,send:2,wait:70,receive:28},
  }] } };
}

describe('HAR sanitizer', () => {
  it('finds headers, cookies, URL/query values, form bodies, and response JSON without echoing values', () => {
    const analysis=analyzeHar(makeHar());
    expect(analysis.findings.map(f=>f.field)).toEqual(expect.arrayContaining(['request.query:token','request.query:urlOnlySecret','request.body:password','response.body:access_token']));
    const serialized=JSON.stringify(analysis);
    for(const secret of ['query-secret','url-secret','form-secret','response-secret','top-secret-token']) expect(serialized).not.toContain(secret);
  });

  it('redacts credentials across request URL, form text, and response JSON', async () => {
    const result=await sanitizeHar(makeHar(),{mode:'redact',categories:{headers:true,cookies:true,query:true,bodies:true}});
    const text=JSON.stringify(result.har);
    for(const secret of ['query-secret','url-secret','form-secret','response-secret','top-secret-token','session-secret']) expect(text).not.toContain(secret);
    expect(text).toContain('safe=visible');
    expect(result.changedFindings.length).toBeGreaterThan(0);
    expect(result.outputFindings.some(f=>f.field==='response.body:access_token')).toBe(true);
  });

  it('hashes deterministically and supports a custom mask', async () => {
    const policy={mode:'hash' as const,categories:{headers:true,cookies:true,query:true,bodies:true}};
    expect((await sanitizeHar(makeHar(),policy)).har).toEqual((await sanitizeHar(makeHar(),policy)).har);
    const masked=await sanitizeHar(makeHar(),{mode:'mask',mask:'CUSTOM-MASK',categories:{headers:true,cookies:true,query:true,bodies:true}});
    expect(JSON.stringify(masked.har)).toContain('CUSTOM-MASK');
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
