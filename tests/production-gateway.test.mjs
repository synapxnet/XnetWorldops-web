/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：真实 HTTP 生产认证边界测试。 Purpose: Real HTTP production authentication boundary tests.
Author: maoyo | Department: 研发部 | Date: 2026-09-20
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createProductionGateway,environmentConfig} from '../server-production.mjs';
const origin='https://worldops.test';

/** 在随机端口启动测试服务。 Start a test server on an ephemeral port. */
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
/** 关闭测试服务。 Close a test server. */
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
/** 创建隔离身份和后端服务，不连接真实平台。 Create isolated identity and backend services without contacting live platforms. */
async function fixture(t,options={}){
  const folder=await mkdtemp(path.join(tmpdir(),'worldops-auth-'));await mkdir(path.join(folder,'dist'));await writeFile(path.join(folder,'dist/index.html'),'<h1>login shell</h1>');await writeFile(path.join(folder,'dist/private.json'),'private');
  await writeFile(path.join(folder,'access.json'),JSON.stringify({grants:[{projectId:'test-project',token:'test-only-project-secret'}]}));
  const state={userId:'test-user',now:1_000_000,identityCalls:[],backendCalls:[],identityUnavailable:false};
  const backend=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;state.backendCalls.push({headers:req.headers,path:req.url,method:req.method,body});res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({code:0,data:{projectId:'test-project'}}));});
  const backendPort=await listen(backend);
  /** 返回可控身份响应，核对目标始终固定。 Return controlled identity responses and verify pinned destinations. */
  async function identityFetch(url,request){state.identityCalls.push({url,request});assert.ok(url.startsWith('https://goai.xnetmlops.synapxnet.online/api/'));assert.equal(request.redirect,'error');if(state.identityUnavailable)throw new Error('offline');return {ok:true,status:200,json:async()=>({code:0,data:url.endsWith('/auth/login')?{accessToken:'test-only-identity-token'}:{userId:state.userId,userName:'Test operator'}})};}
  const gateway=createProductionGateway({origin,backendUrl:`http://127.0.0.1:${backendPort}/`,allowedUserIds:['test-user'],configFile:path.join(folder,'access.json'),projectId:'test-project',dist:path.join(folder,'dist'),identityFetch,clock:()=>state.now,sessionTtlMs:10_000,revalidateMs:2_000,...options});
  const port=await listen(gateway);t.after(async()=>{await close(gateway);await close(backend);await rm(folder,{recursive:true,force:true});});
  /** 用真实 HTTP 检验 Cookie、Origin 和身份隔离。 Exercise cookies, Origin and identity isolation over real HTTP. */
  async function request(route,{method='GET',body,headers={},cookie}={}){
    return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:route,method,headers:{Host:'worldops.test',...(method==='POST'?{Origin:origin,'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers}},res=>{let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>{let value;try{value=JSON.parse(raw);}catch{value=raw;}resolve({status:res.statusCode,headers:res.headers,body:value,raw});});});req.on('error',reject);req.end(body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body));});
  }
  /** 仅使用隔离测试凭据建立会话。 Establish a session using isolated test credentials. */
  async function login(){const response=await request('/auth/login',{method:'POST',body:{userPhone:'12345678901',code:'fixture-only'}});return {...response,cookie:response.headers['set-cookie']?.[0].split(';')[0]};}
  return {state,request,login};
}

test('configuration fails closed without explicit access list and private backend',()=>{assert.throws(()=>environmentConfig({WORLDOPS_PUBLIC_ORIGIN:origin,WORLDOPS_ACCESS_FILE:'/secret'}),/ALLOWED_USER_IDS/);assert.throws(()=>environmentConfig({WORLDOPS_PUBLIC_ORIGIN:origin,WORLDOPS_BACKEND_URL:'https://attacker.invalid/',WORLDOPS_ACCESS_FILE:'/secret',WORLDOPS_ALLOWED_USER_IDS:'a'}),/private/);});
test('public shell and health expose no project; all data requires a session',async t=>{const f=await fixture(t);assert.equal((await f.request('/')).status,200);assert.deepEqual((await f.request('/health')).body,{status:'ok'});for(const route of ['/local-info','/api/worldops/v1/capabilities','/auth/session'])assert.equal((await f.request(route)).status,401);assert.equal((await f.request('/private.json')).status,404);assert.equal(f.state.backendCalls.length,0);});
test('login validates identity and injects fixed project credentials only server-side',async t=>{const f=await fixture(t);const auth=await f.login();assert.equal(auth.status,200);assert.match(auth.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Strict/);assert.ok(!auth.raw.includes('token'));assert.equal(f.state.identityCalls.length,2);const result=await f.request('/api/worldops/v1/capabilities',{cookie:auth.cookie,headers:{Authorization:'Bearer attacker','X-Project-Id':'attacker'}});assert.equal(result.status,200);assert.equal(f.state.backendCalls[0].headers.authorization,'Bearer test-only-project-secret');assert.equal(f.state.backendCalls[0].headers['x-project-id'],'test-project');assert.equal(f.state.backendCalls[0].headers.host,'127.0.0.1:5317');assert.equal((await f.request('/local-info',{cookie:auth.cookie})).body.mode,'cloud');});
test('unauthorized account cannot create a session or access the backend',async t=>{const f=await fixture(t);f.state.userId='unauthorized';const auth=await f.login();assert.equal(auth.status,403);assert.equal(auth.cookie,undefined);assert.equal(f.state.backendCalls.length,0);});
test('normal workbench refresh permits five simultaneous catalog requests',async t=>{const f=await fixture(t);const auth=await f.login();const results=await Promise.all(['/capabilities','/environments','/devices','/episodes','/simulation-runs'].map(route=>f.request('/api/worldops/v1'+route,{cookie:auth.cookie})));assert.ok(results.every(result=>result.status===200));assert.equal(f.state.backendCalls.length,5);});
test('expired and logged-out sessions cannot read data',async t=>{const f=await fixture(t);const auth=await f.login();f.state.now+=10_001;assert.equal((await f.request('/local-info',{cookie:auth.cookie})).status,401);const fresh=await f.login();assert.equal((await f.request('/auth/logout',{method:'POST',cookie:fresh.cookie,body:{}})).status,200);assert.equal((await f.request('/api/worldops/v1/devices',{cookie:fresh.cookie})).status,401);});
test('periodic verification revokes an identity removed from the allowlist',async t=>{const f=await fixture(t);const auth=await f.login();f.state.now+=2_001;f.state.userId='other-user';assert.equal((await f.request('/local-info',{cookie:auth.cookie})).status,403);assert.equal((await f.request('/auth/session',{cookie:auth.cookie})).status,401);});
test('identity outage fails closed instead of turning into local mode',async t=>{const f=await fixture(t);f.state.identityUnavailable=true;assert.equal((await f.login()).status,503);assert.equal((await f.request('/local-info')).status,401);});
test('cross-site, missing Origin and non-JSON writes cannot reach upstream',async t=>{const f=await fixture(t);const auth=await f.login();for(const headers of [{Origin:'https://attacker.invalid'},{Origin:''},{'Content-Type':'text/plain'},{'Sec-Fetch-Site':'cross-site'}]){assert.equal((await f.request('/api/worldops/v1/devices',{method:'POST',body:{},cookie:auth.cookie,headers})).status,403);}assert.equal((await f.request('/auth/logout',{method:'POST',cookie:auth.cookie,body:{},headers:{Origin:'https://attacker.invalid'}})).status,403);assert.equal(f.state.backendCalls.length,0);assert.equal((await f.request('/auth/session',{cookie:auth.cookie})).status,200);});
test('bounded requests, unknown paths and rate limits retain real HTTP failures',async t=>{const f=await fixture(t,{loginLimit:2});const auth=await f.login();assert.equal((await f.request('/api/worldops/v1/devices',{method:'POST',body:{value:'x'.repeat(17000)},cookie:auth.cookie})).status,413);assert.equal((await f.request('/api/other',{cookie:auth.cookie})).status,404);assert.equal((await f.request('/api/worldops/v1/devices',{method:'DELETE',cookie:auth.cookie})).status,405);assert.equal((await f.request('/health',{headers:{Host:'attacker.invalid'}})).status,403);await f.login();assert.equal((await f.login()).status,429);});
