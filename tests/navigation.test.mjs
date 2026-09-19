/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：延迟仿真响应与用户导航回归。Purpose: Delayed simulation and user navigation regression.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {computed,ref} from 'vue';
import * as model from '../src/model.js';
import * as skins from '../src/skins.js';

const component=readFileSync(new URL('../src/App.vue',import.meta.url),'utf8');
const script=component.split('<script setup>')[1]?.split('</script>')[0];
assert.ok(script,'App.vue must expose its actual setup script to this behavioral harness');

/** 执行实际组件逻辑，仅替换网络与挂载生命周期，不创建浏览器或物理仿真。 Execute actual component logic with controlled networking and mounting, without a browser or physics run. */
function createHarness(){
  let resolveRun;
  let cleanup;
  const capabilities={simulation:{availability:'available'}};
  const environment={id:'review-environment',resourceVersion:'review-version',availability:'available'};
  const history={id:'historical-episode',environmentId:environment.id,environmentVersion:environment.resourceVersion,timeline:[]};
  const fresh={...history,id:'new-episode'};
  const requestedEpisodes=[];

  /** 延迟创建请求，其他目录返回明确标记的测试数据。 Defer run creation and return explicitly identified test catalogs. */
  async function request(path,project,options){
    assert.equal(project,'review-project');
    if(options?.method==='POST'){
      assert.equal(path,'/simulation-runs');
      /** 保存完成回调，以便在用户操作之后送达响应。 Retain completion so the response arrives after user interaction. */
      return new Promise(resolve=>{resolveRun=resolve;});
    }
    if(path==='/capabilities')return capabilities;
    if(path==='/environments')return {items:[environment]};
    if(path==='/devices'||path==='/simulation-runs')return {items:[]};
    if(path==='/episodes')return {items:[fresh,history],nextCursor:null};
    if(path.startsWith('/episodes/')){
      const id=decodeURIComponent(path.slice('/episodes/'.length));
      requestedEpisodes.push(id);
      assert.ok([history.id,fresh.id].includes(id));
      return id===history.id?history:fresh;
    }
    throw new Error(`Unexpected test endpoint: ${path}`);
  }

  /** 返回测试专用项目绑定。 Return the test-only project binding. */
  async function fetchInfo(path){
    assert.equal(path,'/local-info');
    /** 解码测试项目说明。 Decode the test project description. */
    async function json(){return {projectId:'review-project'};}
    return {ok:true,json};
  }

  /** 不自动挂载，以便精确控制初始目录。 Avoid automatic mounting to control initial catalogs precisely. */
  function onMounted(){}
  /** 保存真实组件清理回调。 Retain the actual component cleanup callback. */
  function onBeforeUnmount(callback){cleanup=callback;}
  /** 生成测试用幂等标识。 Generate a test idempotency identity. */
  function randomUUID(){return 'navigation-review-identity';}

  const context={...model,...skins,ref,computed,onMounted,onBeforeUnmount,request,fetch:fetchInfo,setTimeout,clearTimeout,crypto:{randomUUID}};
  vm.runInNewContext(script.replace(/^import .*;\r?\n/gm,'')+
    ';globalThis.app={simulate,navigate,selectEpisode,view,episode,capabilities,environments,selectedEnvironment,project,busy,error};',context);
  const app=context.app;
  app.project.value='review-project';
  app.capabilities.value=capabilities;
  app.environments.value=[environment];
  app.selectedEnvironment.value=environment.id;

  /** 返回已持久化的新结果，结束受控等待。 Complete the controlled wait with a persisted result. */
  function finish(){assert.equal(typeof resolveRun,'function');resolveRun({status:'succeeded',episodeId:fresh.id});}
  /** 运行真实清理函数，防止测试保留定时器。 Run actual cleanup to avoid retaining timers. */
  function dispose(){cleanup?.();}
  return {app,finish,dispose,requestedEpisodes};
}

/** 验证迟到的仿真完成不会把用户拉离记录页。 Verify late simulation completion does not pull the user away from run history. */
test('simulation completion preserves a page selected while waiting',async()=>{
  const harness=createHarness();
  try{
    const pending=harness.app.simulate();
    assert.equal(harness.app.busy.value,true);
    harness.app.navigate('runs');
    harness.finish();
    await pending;
    assert.equal(harness.app.view.value,'runs');
    assert.equal(harness.app.episode.value,null);
    assert.deepEqual(harness.requestedEpisodes,[]);
    assert.equal(harness.app.busy.value,false);
    assert.equal(harness.app.error.value,'');
  }finally{harness.dispose();}
});

/** 验证用户选择的旧记录不会被新运行结果覆盖。 Verify a historical episode selected by the user is not replaced by the new result. */
test('simulation completion preserves a historical episode selected while waiting',async()=>{
  const harness=createHarness();
  try{
    const pending=harness.app.simulate();
    await harness.app.selectEpisode('historical-episode');
    harness.finish();
    await pending;
    assert.equal(harness.app.view.value,'studio');
    assert.equal(harness.app.episode.value.id,'historical-episode');
    assert.deepEqual(harness.requestedEpisodes,['historical-episode']);
    assert.equal(harness.app.error.value,'');
  }finally{harness.dispose();}
});

/** 用户没有导航时仍自动展示本次结果，避免修复破坏正常流程。 Still show the new result automatically when the user has not navigated. */
test('simulation completion opens its episode when the original view is untouched',async()=>{
  const harness=createHarness();
  try{
    const pending=harness.app.simulate();
    harness.finish();
    await pending;
    assert.equal(harness.app.view.value,'studio');
    assert.equal(harness.app.episode.value.id,'new-episode');
    assert.deepEqual(harness.requestedEpisodes,['new-episode']);
    assert.equal(harness.app.error.value,'');
  }finally{harness.dispose();}
});
