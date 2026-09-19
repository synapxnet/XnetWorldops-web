/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：仅本机的界面与认证代理。Purpose: Loopback-only UI and authenticated proxy.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));

/** 检查代理请求的主机和来源，防止其他站点触发本地计算。 Check host and origin to prevent cross-site local computation. */
export function allowedRequest(method, headers, port) {
  const host=`127.0.0.1:${port}`;
  if(headers.host!==host) return false;
  if(headers.origin && headers.origin!==`http://${host}`) return false;
  if(headers['sec-fetch-site']==='cross-site') return false;
  if(method==='POST') return headers.origin===`http://${host}` && /^application\/json(?:;|$)/i.test(headers['content-type']||'');
  return method==='GET';
}
/** 返回无敏感诊断的本机错误。 Return local errors without sensitive diagnostics. */
function fail(response, status, message) {
  response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  response.end(JSON.stringify({code:'LOCAL_GATEWAY',message,data:null}));
}
/** 创建固定目标与固定项目的本机网关。 Create a local gateway with a fixed backend and project. */
export function createGateway({port=5318,backendPort=5317,configFile=path.resolve(root,'../backend/.local/access.local.json'),projectId='local-world',dist=path.join(root,'dist')}={}) {
  /** 路由静态界面或已授权的领域API，不接受任意代理地址。 Route static UI or authorized domain APIs without arbitrary destinations. */
  async function handle(request,response) {
    response.setHeader('X-Content-Type-Options','nosniff');
    response.setHeader('Referrer-Policy','no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy','same-origin');
    const url=new URL(request.url,'http://127.0.0.1');
    if(request.headers.host!==`127.0.0.1:${port}`) return fail(response,403,'请使用本机工作台地址');
    if(url.pathname==='/local-info' && request.method==='GET') {
      if(!allowedRequest('GET',request.headers,port)) return fail(response,403,'来源不允许');
      response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      return response.end(JSON.stringify({projectId,mode:'local',backendPort}));
    }
    if(url.pathname.startsWith('/api/')) {
      if(!allowedRequest(request.method,request.headers,port) || !url.pathname.startsWith('/api/worldops/v1/')) return fail(response,403,'请求来源或路径不允许');
      let grant;
      try {
        const config=JSON.parse(await readFile(configFile,'utf8'));
        /** 只选择明确绑定当前项目的授权。 Select the grant explicitly bound to this project. */
        grant=config.grants?.find(item=>item.projectId===projectId);
        if(!grant?.token) throw new Error('missing');
      } catch { return fail(response,503,'本地项目尚未初始化，请使用启动脚本打开工作台'); }
      const chunks=[]; let length=0;
      for await(const chunk of request) {length+=chunk.length;if(length>4096) return fail(response,413,'请求内容过大');chunks.push(chunk);}
      const body=Buffer.concat(chunks);
      const headers={'Authorization':`Bearer ${grant.token}`,'X-Project-Id':projectId,'Content-Type':'application/json','Content-Length':body.length};
      if(request.headers['idempotency-key']) headers['Idempotency-Key']=request.headers['idempotency-key'];
      /** 流式转发后端真实状态，不暴露连接凭据。 Forward real backend status without exposing credentials. */
      const upstream=http.request({hostname:'127.0.0.1',port:backendPort,path:url.pathname+url.search,method:request.method,headers,timeout:95000},incoming=>{
        response.writeHead(incoming.statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
        incoming.pipe(response);
      });
      /** 超时终止当前等待，不自动重复仿真。 End a timed-out wait without automatically repeating simulation. */
      upstream.on('timeout',()=>upstream.destroy(new Error('timeout')));
      /** 连接失败显示离线，不生成样本响应。 Show offline status without synthesizing data. */
      upstream.on('error',()=>{if(!response.headersSent) fail(response,502,'本地服务未连接，请先启动 WorldOps 服务');else response.end();});
      upstream.end(body);return;
    }
    if(request.method!=='GET') return fail(response,405,'不支持此操作');
    let relative;
    try {relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');} catch {return fail(response,400,'地址无效');}
    const file=path.resolve(dist,relative||'index.html');
    if(!file.startsWith(path.resolve(dist)+path.sep)) return fail(response,404,'页面不存在');
    try {
      const content=await readFile(file);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml'};
      response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'"});response.end(content);
    } catch {fail(response,404,'界面尚未构建或页面不存在');}
  }
  /** 捕获请求边界异常，保持进程可用。 Catch request-boundary errors and keep the server available. */
  return http.createServer((request,response)=>{handle(request,response).catch(()=>{if(!response.headersSent)fail(response,500,'本地工作台暂时无法响应');else response.end();});});
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const port=Number(process.env.WORLDOPS_WEB_PORT||5318);
  const backendPort=Number(process.env.WORLDOPS_API_PORT||5317);
  const server=createGateway({port,backendPort,configFile:process.env.WORLDOPS_ACCESS_FILE,projectId:process.env.WORLDOPS_PROJECT_ID||'local-world'});
  /** 报告本机入口，不输出令牌。 Report the loopback entry without printing tokens. */
  server.listen(port,'127.0.0.1',()=>console.log(`XnetWorldOps: http://127.0.0.1:${port}`));
}
