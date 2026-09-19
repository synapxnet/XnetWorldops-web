<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：云端会话入口与本机兼容。 Purpose: Cloud session entry with loopback compatibility.
Author: maoyo | Department: 研发部 | Date: 2026-09-20
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {onMounted,onBeforeUnmount,ref} from 'vue';
import App from './App.vue';
const ready=ref(false),authenticated=ref(false),local=ref(false),busy=ref(false),error=ref(''),userPhone=ref(''),code=ref(''),user=ref(null);
let timer=null,disposed=false,generation=0;
/** 请求有界等待的同源身份接口。 Request a same-origin identity endpoint with a bounded wait. */
async function authRequest(path,options={}){return fetch(path,{...options,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15_000)});}
/** 身份过期立即卸载业务页面，避免保留上一会话资料。 Unmount business data immediately when the identity expires. */
function expire(){generation++;authenticated.value=false;user.value=null;error.value='登录已失效，请重新登录';}
/** 仅明确的回环旧网关 404 可启用本机模式。 Only an explicit legacy loopback gateway 404 permits local mode. */
async function checkSession(){
  const current=++generation;
  try{const response=await authRequest('/auth/session');if(disposed||current!==generation)return;
    if(response.status===404&&location.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(location.hostname)){local.value=true;authenticated.value=true;return;}
    if(response.status===401||response.status===403){authenticated.value=false;user.value=null;return;}
    if(!response.ok)throw new Error('登录服务暂不可用，请重试');
    const body=await response.json();if(body.authenticated!==true||body.mode!=='cloud')throw new Error('登录状态无法确认，请重试');
    authenticated.value=true;user.value=body.user;error.value='';
  }catch(cause){if(current===generation&&!disposed){authenticated.value=false;user.value=null;error.value=cause.name==='TimeoutError'?'连接超时，请重试':cause.message;}}
  finally{if(current===generation&&!disposed)ready.value=true;}
}
/** 登录凭据仅用于本次请求，不写入浏览器存储。 Use login credentials once without browser persistence. */
async function login(){if(busy.value)return;busy.value=true;error.value='';const current=++generation;
  try{const response=await authRequest('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userPhone:userPhone.value.trim(),code:code.value})});const body=await response.json();if(disposed||current!==generation)return;if(!response.ok||body.authenticated!==true)throw new Error(body.message||'登录未完成');code.value='';authenticated.value=true;user.value=body.user;}
  catch(cause){if(!disposed&&current===generation)error.value=cause.name==='TimeoutError'?'登录超时，请重试':cause.message;}
  finally{if(!disposed)busy.value=false;}
}
/** 退出前撤销服务端会话，再清空页面身份。 Revoke the server session before clearing the page identity. */
async function logout(){if(busy.value)return;busy.value=true;try{const response=await authRequest('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!response.ok)throw new Error('退出未完成，请重试');generation++;authenticated.value=false;user.value=null;error.value='';}catch(cause){error.value=cause.message;}finally{busy.value=false;}}
/** 挂载时检查身份并周期校验，无效身份不能继续操作。 Check identity on mount and periodically before further operations. */
function initialize(){checkSession();window.addEventListener('worldops:unauthenticated',expire);timer=setInterval(()=>{if(authenticated.value&&!local.value&&!busy.value)checkSession();},60_000);}
/** 清理定时器并失效迟到响应。 Clean up timers and invalidate late responses. */
function dispose(){disposed=true;generation++;clearInterval(timer);window.removeEventListener('worldops:unauthenticated',expire);}
onMounted(initialize);onBeforeUnmount(dispose);
</script>
<template>
  <template v-if="authenticated"><App/><div v-if="!local" class="cloud-session"><span>{{user?.name||'已登录'}}</span><button :disabled="busy" @click="logout">退出登录</button><span v-if="error" role="alert">{{error}}</span></div></template>
  <main v-else class="login-page">
    <section class="login-story"><img src="/logo.png" alt="SynapXnet"><span class="login-eyebrow">SYNAPXNET · WORLDOPS</span><h1>让智能<br>走进物理世界。</h1><p>从环境感知到仿真验证，把设备、空间与每一次实验连接起来。</p><div class="login-orbit" aria-hidden="true"><i></i><i></i><i></i><b>W</b></div><footer>感知 · 仿真 · 受控执行 · 结果验证</footer></section>
    <section class="login-card"><span class="login-eyebrow">物理世界工作区</span><h2>欢迎进入 XnetWorldOps</h2><p>使用已获授权的平台账号继续。</p><div v-if="!ready" role="status" class="login-note">正在检查登录状态…</div><form v-else @submit.prevent="login"><label for="world-phone">手机号<input id="world-phone" v-model="userPhone" autocomplete="username" inputmode="tel" maxlength="20" required :disabled="busy" placeholder="输入平台手机号"></label><label for="world-code">登录凭据<input id="world-code" v-model="code" type="password" autocomplete="current-password" maxlength="128" required :disabled="busy" placeholder="输入平台登录凭据"></label><p v-if="error" class="login-error" role="alert">{{error}}</p><button class="login-submit" :disabled="busy">{{busy?'正在验证身份…':'登录工作台'}} <span>↗</span></button><button v-if="error" type="button" class="login-retry" :disabled="busy" @click="checkSession">重新检查连接</button></form><div class="login-note">账号通过现有平台身份服务验证。当前工作区提供仿真与资料管理，真实硬件控制尚未开放。</div><small>SynapXnet · XnetWorldOps</small></section>
  </main>
</template>
<style scoped>
.login-page{min-height:100dvh;display:grid;grid-template-columns:1fr 1fr;background:#f5f8fc;color:#1b2b43;font-family:Inter,"Microsoft YaHei",sans-serif}.login-story{position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:flex-start;padding:64px max(36px,8vw);background:linear-gradient(145deg,#102641,#17446b 65%,#087b9b);color:#edf7ff}.login-story>img{width:56px;height:56px;object-fit:contain;margin-bottom:46px}.login-eyebrow{font-size:12px;letter-spacing:2px;font-weight:650;color:#67829e}.login-story .login-eyebrow{color:#9ed0e6}.login-story h1{font-size:clamp(34px,4vw,62px);line-height:1.25;font-weight:650;letter-spacing:1px;margin:22px 0}.login-story p{max-width:360px;line-height:1.9;color:#c7deee}.login-story footer{margin-top:auto;padding-top:80px;font-size:12px;letter-spacing:1px;color:#b9d0e0}.login-orbit{position:relative;align-self:center;width:220px;height:220px;margin:24px 0 8px;display:grid;place-items:center}.login-orbit i{position:absolute;inset:0;border:1px solid #66d5ef70;border-radius:50%;transform:rotateX(60deg) rotateZ(20deg)}.login-orbit i:nth-child(2){transform:rotateY(50deg) rotateZ(-24deg)}.login-orbit i:nth-child(3){inset:24px;border-color:#87adff80}.login-orbit b{display:grid;place-items:center;width:82px;height:82px;border:1px solid #8ed9ec;border-radius:24px;box-shadow:0 0 50px #42cbe340;background:#ffffff10;color:#d7f7ff;font-size:38px}.login-card{align-self:center;justify-self:center;width:min(390px,calc(100% - 64px));padding:48px 0}.login-card h2{font-size:25px;line-height:1.5;margin:15px 0 8px}.login-card>p{font-size:14px;color:#647589;margin-bottom:30px}.login-card form{display:grid;gap:20px}.login-card label{display:grid;gap:9px;font-size:13px;font-weight:600}.login-card input{box-sizing:border-box;width:100%;height:48px;padding:0 14px;border:1px solid #d0dce9;border-radius:10px;background:white;color:#17314f;font:inherit;font-size:14px;transition:border-color .15s,box-shadow .15s}.login-card input:focus{outline:none;border-color:#2978c5;box-shadow:0 0 0 3px #2978c518}.login-submit{display:flex;justify-content:space-between;align-items:center;border:0;border-radius:10px;background:linear-gradient(100deg,#2468bd,#1687a5);color:white;padding:14px 18px;font:inherit;font-size:14px;cursor:pointer}.login-submit:disabled{opacity:.6;cursor:wait}.login-note{font-size:12px;line-height:1.8;color:#728399;margin:25px 0}.login-error{margin:0;color:#b13c49;font-size:13px;line-height:1.6}.login-retry{border:0;background:none;color:#2468bd;cursor:pointer}.login-card small{color:#8795a8;font-size:11px}.cloud-session{position:fixed;left:15px;bottom:7px;z-index:20;display:flex;align-items:center;gap:8px;max-width:204px;font:11px Inter,"Microsoft YaHei",sans-serif;color:#647589;background:#eff5fa;border-radius:6px;padding:4px 7px}.cloud-session button{border:0;background:none;color:#2867a6;font:inherit;cursor:pointer}.cloud-session>span[role=alert]{position:absolute;left:0;bottom:32px;background:#fff5f5;width:190px;padding:8px;color:#b13c49}@media(max-width:760px){.login-page{grid-template-columns:1fr}.login-story{padding:30px}.login-story>img{width:38px;height:38px;margin-bottom:20px}.login-story h1{font-size:28px;margin:12px 0}.login-story h1 br{display:none}.login-story p,.login-orbit,.login-story footer{display:none}.login-card{padding:34px 0}.cloud-session{left:auto;right:12px;bottom:8px}}
</style>
