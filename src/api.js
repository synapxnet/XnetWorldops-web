/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：同源WorldOps客户端。Purpose: Same-origin WorldOps client.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import {unwrap} from './model.js';
/** 请求同源网关并保留HTTP失败语义。 Request the same-origin gateway and preserve HTTP failures. */
export async function request(path, projectId, options={}) {
  const controller=new AbortController();
  /** 到时取消网络等待，幂等身份由调用方保留。 Abort the wait while the caller retains its idempotency identity. */
  const timer=setTimeout(()=>controller.abort(),90000);
  try {
    const response=await fetch('/api/worldops/v1'+path,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
    const body=await response.json();
    if(!response.ok) {if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('worldops:unauthenticated'));const error=new Error(response.status===502 ? 'WorldOps 服务暂时无法连接，请稍后重试' : (body.message || `请求未完成（${response.status}）`));error.status=response.status;throw error;}
    return unwrap(body,projectId);
  } catch(error) {
    if(error.name==='AbortError') throw new Error('运行仍可能在完成中，请使用重试查询同一次运行');
    throw error;
  } finally { clearTimeout(timer); }
}
