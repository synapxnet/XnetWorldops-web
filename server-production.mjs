/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：固定身份与项目绑定的生产网关。 Purpose: Production gateway with fixed identity and project bindings.
Author: maoyo | Department: 研发部 | Date: 2026-09-20
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const IDENTITY_ORIGIN='https://goai.xnetmlops.synapxnet.online';
const COOKIE='__Host-worldops_session';
const CSP="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'";

/** 返回固定格式错误，不包含内部地址或凭据。 Return fixed errors without internal addresses or credentials. */
function send(response,status,value){response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});response.end(JSON.stringify(value));}
/** 构造可控错误。 Construct a controlled request error. */
function rejected(status,message){return Object.assign(new Error(message),{status});}
/** 限制正文，避免过大或缓慢上传耗尽资源。 Bound request bodies against excessive and slow uploads. */
async function readBody(request){
  if(Number(request.headers['content-length']||0)>16384)throw rejected(413,'请求内容过大');
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>16384)throw rejected(413,'请求内容过大');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
/** 读取 JSON 对象，拒绝无效输入。 Read a JSON object and reject malformed input. */
function jsonObject(body){try{const value=JSON.parse(body.toString('utf8'));if(value&&typeof value==='object'&&!Array.isArray(value))return value;}catch{}throw rejected(400,'请求格式无效');}
/** 提取唯一固定会话 Cookie。 Extract the single fixed session cookie. */
function sessionId(request){const values=(request.headers.cookie||'').split(';').map(item=>item.trim()).filter(item=>item.startsWith(COOKIE+'='));return values.length===1?values[0].slice(COOKIE.length+1):'';}
/** 配置必须来自受控环境，不能由浏览器改变。 Read trusted configuration that browsers cannot override. */
export function environmentConfig(env=process.env){
  const origin=env.WORLDOPS_PUBLIC_ORIGIN;
  if(!origin||!/^https:\/\/[^/]+$/.test(origin))throw new Error('WORLDOPS_PUBLIC_ORIGIN must be an HTTPS origin');
  const backendUrl=env.WORLDOPS_BACKEND_URL||'http://worldops-api:5317/';
  const target=new URL(backendUrl);
  if(target.protocol!=='http:'||target.hostname!=='worldops-api'||target.port!=='5317'||target.username||target.password||target.search||target.hash||target.pathname!=='/')throw new Error('WORLDOPS_BACKEND_URL must use the private worldops-api:5317 service');
  const allowedUserIds=(env.WORLDOPS_ALLOWED_USER_IDS||'').split(',').map(item=>item.trim()).filter(Boolean);
  if(!allowedUserIds.length)throw new Error('WORLDOPS_ALLOWED_USER_IDS is required');
  if(!env.WORLDOPS_ACCESS_FILE)throw new Error('WORLDOPS_ACCESS_FILE is required');
  return {origin,backendUrl,allowedUserIds,configFile:env.WORLDOPS_ACCESS_FILE,projectId:env.WORLDOPS_PROJECT_ID||'local-world'};
}

/** 创建受认证的网关；依赖注入只供隔离测试使用。 Create an authenticated gateway; dependency injection is for isolated tests. */
export function createProductionGateway({origin,backendUrl,allowedUserIds,configFile,projectId='local-world',dist=path.join(root,'dist'),identityFetch=fetch,clock=Date.now,sessionTtlMs=30*60_000,revalidateMs=5*60_000,loginLimit=20}={}){
  if(!origin||!allowedUserIds?.length||!configFile||!backendUrl)throw new Error('Incomplete production configuration');
  const expectedHost=new URL(origin).host;
  const target=new URL(backendUrl);
  const allowed=new Set(allowedUserIds),sessions=new Map();
  let active=0,loginCount=0,loginWindow=clock();

  /** 固定身份服务调用，禁止跳转及泄漏下游响应。 Call only the pinned identity service without redirects or raw error leakage. */
  async function identity(pathname,options){
    let response,body;
    try{response=await identityFetch(IDENTITY_ORIGIN+pathname,{...options,redirect:'error',signal:AbortSignal.timeout(12_000)});body=await response.json();}catch{throw rejected(503,'身份服务暂时不可用，请稍后重试');}
    if(!response.ok||![0,200].includes(Number(body?.code)))throw rejected(response.status>=500?503:401,'账号验证未通过，请检查登录信息');
    return body.data;
  }
  /** 回读用户身份并核对服务端访问名单。 Revalidate user identity against the server access list. */
  async function resolveUser(token){
    const data=await identity('/api/user/info',{headers:{Authorization:'Bearer '+token}});
    const id=typeof data?.userId==='string'||typeof data?.userId==='number'?String(data.userId):'';
    if(!id||!allowed.has(id))throw rejected(403,'此账号尚未获授 WorldOps 访问权限');
    return {id,name:String(data.realName||data.username||data.userName||'平台用户').slice(0,80)};
  }
  /** 清理过期会话并获取当前会话，定期重新验证上游权限。 Purge expired sessions and periodically revalidate upstream authorization. */
  async function currentSession(request){
    const now=clock();for(const [key,value] of sessions)if(now>=value.expiresAt)sessions.delete(key);
    const id=sessionId(request),session=sessions.get(id);
    if(!session)throw rejected(401,'登录已失效，请重新登录');
    if(now-session.verifiedAt>=revalidateMs){
      try{const user=await resolveUser(session.token);if(user.id!==session.user.id)throw rejected(401,'登录身份已变化');if(!sessions.has(id)||clock()>=session.expiresAt)throw rejected(401,'登录已失效');session.user=user;session.verifiedAt=clock();}
      catch(error){sessions.delete(id);throw error;}
    }
    return session;
  }
  /** 仅在同源、安全请求中设置会话。 Set session cookies only for same-origin authenticated requests. */
  function cookie(response,id,maxAge){response.setHeader('Set-Cookie',`${COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);}
  /** 固定项目代理，不信任客户端授权字段。 Proxy the fixed project without trusting client authorization fields. */
  async function proxy(request,response,url,body,session){
    if(session.active>=12)throw rejected(429,'当前任务较多，请稍后重试');
    session.active++;
    let grant;
    try{const file=JSON.parse(await readFile(configFile,'utf8'));grant=file.grants?.find(item=>item.projectId===projectId);if(!grant?.token)throw new Error('missing');}catch{session.active--;throw rejected(503,'项目授权暂不可用');}
    const headers={Host:'127.0.0.1:5317',Authorization:'Bearer '+grant.token,'X-Project-Id':projectId,'Content-Type':'application/json','Content-Length':body.length};
    const key=request.headers['idempotency-key'];if(key){if(!/^[A-Za-z0-9._:-]{1,160}$/.test(key)){session.active--;throw rejected(400,'操作标识无效');}headers['Idempotency-Key']=key;}
    /** 等待后端完成，连接关闭不会重复执行。 Wait for the backend without retrying on disconnect. */
    await new Promise(resolve=>{
      let finished=false;
      /** 单次释放请求额度。 Release request capacity exactly once. */
      function finish(){if(finished)return;finished=true;session.active--;resolve();}
      const upstream=http.request({hostname:target.hostname,port:target.port,path:url.pathname+url.search,method:request.method,headers,timeout:95_000},incoming=>{
        response.writeHead(incoming.statusCode,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});incoming.pipe(response);
        incoming.on('error',()=>{response.destroy();finish();});incoming.on('end',finish);
      });
      upstream.on('timeout',()=>upstream.destroy(new Error('timeout')));
      upstream.on('error',()=>{if(!response.headersSent)send(response,502,{code:'WORLDOPS_GATEWAY',message:'WorldOps 服务暂时无法连接',data:null});else response.end();finish();});
      response.on('close',()=>{if(!response.writableEnded)upstream.destroy();finish();});upstream.end(body);
    });
  }
  /** 路由登录、受保护资料及公开静态壳。 Route login, protected data and the public static shell. */
  async function handle(request,response){
    response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cross-Origin-Resource-Policy','same-origin');response.setHeader('Content-Security-Policy',CSP);
    if(request.headers.host!==expectedHost)throw rejected(403,'请求地址不允许');
    if(request.headers.origin&&request.headers.origin!==origin||['cross-site','same-site'].includes(request.headers['sec-fetch-site']))throw rejected(403,'请求来源不允许');
    if(!['GET','POST'].includes(request.method))throw rejected(405,'不支持此操作');
    if(request.method==='POST'&&(request.headers.origin!==origin||!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers['content-type']||'')))throw rejected(403,'请求来源或内容类型不允许');
    let url;try{url=new URL(request.url,origin);}catch{throw rejected(400,'地址无效');}
    if(url.origin!==origin||request.url.length>2048)throw rejected(400,'地址无效');
    if(url.pathname==='/health'&&request.method==='GET')return send(response,200,{status:'ok'});
    if(url.pathname==='/auth/login'&&request.method==='POST'){
      const now=clock();if(now-loginWindow>=5*60_000){loginWindow=now;loginCount=0;}if(++loginCount>loginLimit)throw rejected(429,'登录尝试较多，请稍后再试');
      const input=jsonObject(await readBody(request));
      if(Object.keys(input).some(key=>!['userPhone','code'].includes(key))||typeof input.userPhone!=='string'||!/^\d{6,20}$/.test(input.userPhone)||typeof input.code!=='string'||input.code.length<1||input.code.length>128)throw rejected(400,'请输入有效的账号和登录凭据');
      const data=await identity('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
      const token=data?.accessToken||data?.token;if(typeof token!=='string'||token.length<1||token.length>16384)throw rejected(401,'账号验证未通过');
      const user=await resolveUser(token);
      for(const [id,value] of sessions)if(now>=value.expiresAt)sessions.delete(id);
      if(sessions.size>=200)throw rejected(503,'当前登录人数较多，请稍后再试');
      sessions.delete(sessionId(request));const id=randomBytes(32).toString('base64url');sessions.set(id,{user,token,expiresAt:clock()+sessionTtlMs,verifiedAt:clock(),active:0});
      cookie(response,id,Math.floor(sessionTtlMs/1000));return send(response,200,{authenticated:true,user,mode:'cloud'});
    }
    if(url.pathname==='/auth/logout'&&request.method==='POST'){await readBody(request);sessions.delete(sessionId(request));cookie(response,'',0);return send(response,200,{authenticated:false});}
    if(url.pathname==='/auth/session'&&request.method==='GET'){const session=await currentSession(request);return send(response,200,{authenticated:true,user:session.user,mode:'cloud',expiresAt:session.expiresAt});}
    if(url.pathname==='/local-info'&&request.method==='GET'){await currentSession(request);return send(response,200,{projectId,mode:'cloud'});}
    if(url.pathname.startsWith('/api/')){
      const session=await currentSession(request);
      if(!url.pathname.startsWith('/api/worldops/v1/')||url.pathname.includes('%')||url.pathname.includes('\\'))throw rejected(404,'接口不存在');
      const body=request.method==='POST'?await readBody(request):Buffer.alloc(0);if(request.method==='POST')jsonObject(body);
      return proxy(request,response,url,body,session);
    }
    if(url.pathname.startsWith('/auth/')||url.pathname==='/local-info'||request.method!=='GET')throw rejected(404,'页面不存在');
    let relative;try{relative=decodeURIComponent(url.pathname).replace(/^\/+/,'');}catch{throw rejected(400,'地址无效');}
    const file=path.resolve(dist,relative||'index.html');
    const extension=path.extname(file);if(!file.startsWith(path.resolve(dist)+path.sep)||relative.split('/').some(item=>item.startsWith('.'))||!['.html','.js','.css','.png','.svg','.ico','.woff','.woff2'].includes(extension))throw rejected(404,'页面不存在');
    const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2'};
    let content;try{content=await readFile(file);}catch{throw rejected(404,'页面不存在');}response.writeHead(200,{'Content-Type':types[extension],'Cache-Control':'no-cache'});response.end(content);
  }
  /** 请求边界限定总并发并隐藏内部异常。 Bound total concurrency and hide internal exceptions at the request boundary. */
  const server=http.createServer(async(request,response)=>{
    if(active>=32){request.resume();return send(response,503,{code:'WORLDOPS_GATEWAY',message:'服务繁忙，请稍后重试',data:null});}
    active++;
    try{await handle(request,response);}catch(error){if(!response.headersSent)send(response,error.status||500,{code:'WORLDOPS_GATEWAY',message:error.status?error.message:'工作台暂时无法响应',data:null});else response.end();request.resume();}finally{active--;}
  });
  server.requestTimeout=15_000;server.headersTimeout=10_000;server.keepAliveTimeout=5_000;server.maxRequestsPerSocket=100;
  server.on('close',()=>sessions.clear());return server;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const server=createProductionGateway(environmentConfig());
  const port=Number(process.env.WORLDOPS_WEB_PORT||5318);
  /** 只输出端口，绝不输出身份或项目凭据。 Report the listening port without credentials. */
  server.listen(port,'0.0.0.0',()=>console.log(`WorldOps production gateway listening on ${port}`));
}
