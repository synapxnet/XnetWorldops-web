/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：响应边界与关键帧时间计算。Purpose: Response boundaries and keyframe time calculations.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {relativeSeconds,renderPosition,environmentGeometry,playbackEnvironment,operationKey,settledRun,phase,unwrap,simulationInput,rejectedBeforeExecution} from '../src/model.js';
import {allowedRequest,createGateway} from '../server.mjs';
/** 验证不合法参数不会进入运行，已知拒绝可以更正。 Verify invalid inputs never create a run and definitive rejections allow correction. */
test('invalid input remains correctable while uncertain execution retains identity',()=>{for(const seed of ['',-1,1.5,Infinity,2147483648]){/** 触发参数拒绝。 Trigger input rejection. */assert.throws(()=>simulationInput('env',seed,''));}assert.deepEqual(simulationInput('env','12',' run:1 '),{environmentId:'env',seed:12,openxnetRunId:'run:1'});/** 触发无效关联拒绝。 Reject an invalid reference. */assert.throws(()=>simulationInput('env',1,'非法引用'));assert.equal(rejectedBeforeExecution(422),true);assert.equal(rejectedBeforeExecution(502),false);assert.equal(rejectedBeforeExecution(undefined),false);});
/** 验证大时间戳仍保留微秒差。 Verify small differences in large timestamps retain precision. */
test('nanoseconds preserve precision and reject invalid ordering',()=>{assert.equal(relativeSeconds('1789300000000000123','1789300000000000000'),.000000123);assert.equal(relativeSeconds('1','2'),null);assert.equal(relativeSeconds(undefined,'1'),null);assert.equal(relativeSeconds('86400000000001','0'),null);});
/** 验证坐标变换和缺失值，不生成假位置。 Verify handedness and missing coordinates without fake positions. */
test('Z-up converts with handedness and rejects incomplete positions',()=>{assert.deepEqual(renderPosition([.2,.3,.8]),[.2,.8,-.3]);assert.equal(renderPosition([0,NaN,1]),null);assert.equal(renderPosition([1,2]),null);});
/** 验证桌面尺寸与区域使用环境源值。 Verify scene geometry uses source dimensions and placement zone. */
test('geometry respects source table and placement metadata',()=>{const env={scene:{upAxis:'z',coordinateSystem:'right-handed',unit:'m',table:{positionM:[0,0,.78],halfSizeM:[.72,.52,.04]},placementZone:{positionM:[.35,.22,.825],radiusM:.09}}};assert.deepEqual(environmentGeometry(env),{tablePosition:[0,.78,-0],tableSize:[1.44,.08,1.04],zonePosition:[.35,.825,-.22],zoneRadius:.09});env.scene.table.halfSizeM[0]=-1;assert.equal(environmentGeometry(env),null);assert.equal(environmentGeometry(null),null);});
/** 验证历史版本不会叠到新环境。 Verify historical playback never uses a newer environment. */
test('playback matches both environment identity and version',()=>{const env={id:'a',resourceVersion:'v2'};assert.equal(playbackEnvironment([env],'a',{environmentId:'a',environmentVersion:'v1'}),null);assert.equal(playbackEnvironment([env],'other',{environmentId:'a',environmentVersion:'v2'}),env);assert.equal(playbackEnvironment([env],'a',null),env);});
/** 验证超时后仍使用原参数与幂等身份。 Verify retries retain original parameters and identity until a terminal state. */
test('pending retry keeps the original request despite input edits',()=>{let calls=0;/** 生成可计数测试标识。 Generate a countable test identity. */const create=()=>String(++calls);const input={seed:1};const first=operationKey(null,input,create);input.seed=2;assert.deepEqual(first.input,{seed:1});assert.equal(operationKey(first,input,create),first);assert.equal(calls,1);assert.equal(settledRun('running'),false);assert.equal(settledRun('unknown'),false);assert.equal(settledRun('succeeded'),true);assert.notEqual(operationKey(null,input,create).key,first.key);});
/** 验证来源与项目隔离。 Verify native source and project isolation. */
test('response rejects mismatched origin and project',()=>{const b={code:0,data:{ok:true},meta:{schemaVersion:'1.0.0',sourcePlatform:'worldops',sourceOrigin:'native',scope:{projectId:'p'}}};assert.deepEqual(unwrap(b,'p'),{ok:true});/** 触发错误项目校验。 Trigger wrong-project validation. */assert.throws(()=>unwrap(b,'q'));b.meta.sourceOrigin='fixture';/** 触发样本来源校验。 Trigger fixture-origin validation. */assert.throws(()=>unwrap(b,'p'));});
/** 验证阶段翻译不会混淆验证和动作。 Verify stage labels distinguish verification from actions. */
test('exact phases distinguish grasp verification',()=>{assert.equal(phase('verify_grasp'),'核验抓取');assert.equal(phase('reach_pregrasp'),'接近抓取点');assert.equal(phase('future_skill'),'future_skill');});
/** 验证本机写入边界。 Verify local write boundaries. */
test('gateway rejects hostile host, origin and non-JSON writes',()=>{const h={host:'127.0.0.1:5318',origin:'http://127.0.0.1:5318','content-type':'application/json'};assert.equal(allowedRequest('POST',h,5318),true);for(const changed of [{host:'evil.test:5318'},{origin:'https://evil.test'},{origin:undefined},{'content-type':'text/plain'},{'sec-fetch-site':'cross-site'}])assert.equal(allowedRequest('POST',{...h,...changed},5318),false);});
/** 在回环地址启动测试服务器。 Listen on a loopback test port. */
async function listen(server,port=0){/** 等待监听结果。 Await the listening result. */await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return server.address().port;}
/** 结束测试服务器并清理连接。 Close the test server and its connections. */
async function close(server){/** 等待关闭完成。 Await server shutdown. */await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}
/** 执行真实HTTP测试请求，不连接产品数据。 Perform a real HTTP test request without product data. */
async function call(port,route,method='GET',headers={},body=''){/** 收集HTTP测试结果。 Collect the HTTP test result. */return new Promise((resolve,reject)=>{/** 收集响应数据。 Collect response bytes. */const req=http.request({hostname:'127.0.0.1',port,path:route,method,headers},res=>{let text='';/** 累积响应。 Accumulate response data. */res.on('data',chunk=>text+=chunk);/** 返回状态与正文。 Return status and body. */res.on('end',()=>resolve({status:res.statusCode,body:text,headers:res.headers}));});req.on('error',reject);req.end(body);});}
/** 验证固定代理、凭据保密、限制及后端失败。 Verify fixed proxying, credential secrecy, boundaries and backend failure. */
test('real gateway injects scoped auth, blocks misuse and preserves errors',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'worldops-gateway-'));const config=path.join(dir,'access.json');await writeFile(config,JSON.stringify({grants:[{projectId:'p',token:'test-secret-only'}]}));await writeFile(path.join(dir,'index.html'),'<title>fixture only</title>');let received;
 /** 模拟领域错误并记录授权头，仅用于测试。 Model a domain error and record auth headers only in tests. */
 const upstream=http.createServer((req,res)=>{received={headers:req.headers,url:req.url};res.writeHead(409,{'Content-Type':'application/json'});res.end(JSON.stringify({code:'RUN_BUSY',message:'busy',data:null}));});
 const backendPort=await listen(upstream);const reservation=http.createServer();const port=await listen(reservation);await close(reservation);const gateway=createGateway({port,backendPort,configFile:config,projectId:'p',dist:dir});await listen(gateway,port);
 try{let r=await call(port,'/local-info');assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.body),{projectId:'p',mode:'local',backendPort});assert.equal(r.body.includes('test-secret'),false);
 r=await call(port,'/api/worldops/v1/simulation-runs','POST',{origin:`http://127.0.0.1:${port}`,'content-type':'application/json','idempotency-key':'retry-1','authorization':'Bearer malicious','x-project-id':'wrong'},'{}');assert.equal(r.status,409);assert.equal(received.headers.authorization,'Bearer test-secret-only');assert.equal(received.headers['x-project-id'],'p');assert.equal(received.headers['idempotency-key'],'retry-1');assert.equal(r.body.includes('test-secret'),false);
 assert.equal((await call(port,'/api/worldops/v1/simulation-runs','POST',{'content-type':'application/json'},'{}')).status,403);
 assert.equal((await call(port,'/api/worldops/v1/simulation-runs','POST',{origin:`http://127.0.0.1:${port}`,'content-type':'application/json'},'x'.repeat(4097))).status,413);
 assert.equal((await call(port,'/api/arbitrary')).status,403);assert.equal((await call(port,'/','GET',{host:'evil.test'})).status,403);assert.equal((await call(port,'/%2e%2e%2faccess.json')).status,404);
 r=await call(port,'/');assert.equal(r.status,200);assert.match(r.headers['content-security-policy'],/frame-ancestors 'none'/);await close(upstream);assert.equal((await call(port,'/api/worldops/v1/capabilities')).status,502);
 }finally{await close(gateway);if(upstream.listening)await close(upstream);await rm(dir,{recursive:true,force:true});}
});
