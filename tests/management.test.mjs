/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：皮肤导入边界、存储失败与表单契约回归。Purpose: Skin boundaries, persistence failures and form contracts.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import {BASE_SKIN,validateSkin,importSkin,exportSkin,loadSkins,saveSkins,skinVariables} from '../src/skins.js';
import {registrationBody,editableRecord,localDateInput,displayValue} from '../src/catalog.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {ref,computed} from 'vue';

/** 执行真实证据组件，仅控制请求和生命周期。 Execute the actual evidence component with controlled requests and lifecycle. */
function evidenceHarness(request){
  const source=readFileSync(new URL('../src/EvidencePage.vue',import.meta.url),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\r?\n/gm,'');
  let identity=0;
  const context={ref,computed,request,URLSearchParams,crypto:{/** 为每次新候选生成不同身份。 Give each new candidate a distinct identity. */randomUUID(){return String(++identity);}},window:{/** 同意测试中的明确取消。 Accept explicit cancellation in the test. */confirm(){return true;}},/** 提供测试项目属性。 Supply test project props. */defineProps(){return {project:'review',kind:'episodes'};},/** 屏蔽外部事件。 Stub external events. */defineEmits(){return ()=>{};},/** 不自动触发读取。 Avoid automatic reads. */onMounted(){},/** 此测试不卸载组件。 Keep the component mounted for this test. */onBeforeUnmount(){},/** 不需要公开组件实例。 Ignore component exposure. */defineExpose(){}};
  vm.runInNewContext(source+';globalThis.page={detail,name,purpose,pendingCandidate,beginCandidate,saveCandidate,candidate,detailError,loading,selected,choose};',context);
  context.page.detail.value={id:'episode-a',name:'封存实验'};
  context.page.beginCandidate();
  context.page.purpose.value='评估回执';
  return context.page;
}

/** 响应丢失时重试不可变的原始请求，防止改参导致幂等冲突。 Retry the immutable original request after response loss to avoid idempotency conflicts. */
test('candidate response loss retries the same immutable identity and payload',async()=>{
  const calls=[];
  const page=evidenceHarness(async(path,project,options)=>{calls.push({path,...options});if(calls.length===1)throw new Error('网络中断');return {id:'candidate-a'};});
  await page.saveCandidate();
  assert.ok(page.pendingCandidate.value);assert.equal(page.candidate.value,true);
  page.name.value='迟到的编辑';page.purpose.value='不同用途';page.detail.value={id:'episode-b'};
  await page.saveCandidate();
  assert.deepEqual(calls[1],calls[0]);assert.equal(page.pendingCandidate.value,null);assert.equal(page.candidate.value,false);
});

/** 明确校验拒绝后允许修正草稿，以新身份保存。 Allow corrected drafts with a fresh identity after an explicit validation rejection. */
test('candidate validation rejection unlocks a corrected draft',async()=>{
  const calls=[];
  const page=evidenceHarness(async(path,project,options)=>{calls.push(options);if(calls.length===1)throw Object.assign(new Error('用途无效'),{status:422});return {id:'candidate-a'};});
  await page.saveCandidate();assert.equal(page.pendingCandidate.value,null);
  page.purpose.value='已修正的用途';await page.saveCandidate();
  assert.notEqual(calls[1].headers['Idempotency-Key'],calls[0].headers['Idempotency-Key']);
  assert.equal(JSON.parse(calls[1].body).purpose,'已修正的用途');
});

/** 比较正在读取时不能改变选中集合。 Keep comparison selections stable while the comparison is loading. */
test('comparison loading prevents checkbox selection changes',()=>{
  const page=evidenceHarness(async()=>({}));page.selected.value=['episode-a','episode-b'];page.loading.value=true;
  const event={target:{checked:false}};page.choose({id:'episode-a'},event);
  assert.equal(event.target.checked,true);assert.deepEqual([...page.selected.value],['episode-a','episode-b']);
});

/** 延迟的皮肤导入不能覆盖后来选择的品牌款式。 A delayed skin import cannot replace a subsequently selected brand profile. */
test('late skin file decoding does not override a newer profile selection',async()=>{
  const source=readFileSync(new URL('../src/SkinPage.vue',import.meta.url),'utf8').split('<script setup>')[1].split('</script>')[0].replace(/^import .*;\r?\n/gm,'');
  let release;
  const context={ref,computed,BASE_SKIN,validateSkin,importSkin,Blob,atob,Uint8Array,window:{/** 接受丢弃测试预览。 Accept discarding the test preview. */confirm(){return true;}},/** 返回真实默认偏好。 Supply actual default preferences. */defineProps(){return {active:BASE_SKIN,profiles:[BASE_SKIN]};},/** 记录外观事件不触发浏览器。 Stub appearance events without a browser. */defineEmits(){return ()=>{};},/** 保持生命周期受控。 Keep lifecycle controlled. */onBeforeUnmount(){},/** 父皮肤不会变化。 Keep the parent skin stable. */watch(){},/** 测试直接调用逻辑。 Access logic directly in the test. */defineExpose(){}};
  vm.runInNewContext(source+';globalThis.page={importFile,select,draft,reading};',context);
  /** 在用户改选之后才结束文件读取。 Complete file reading only after the user switches profiles. */
  const text=()=>new Promise(resolve=>{release=resolve;});
  const pending=context.page.importFile({target:{value:'pending',files:[{size:300,text}]}});
  context.page.select(BASE_SKIN);release(exportSkin({...BASE_SKIN,name:'迟到的皮肤',mode:'dark'}));await pending;
  assert.equal(context.page.draft.value.name,BASE_SKIN.name);assert.equal(context.page.reading.value,false);
});

/** 验证跨平台格式保留全部外观选项。 Verify portable skin format preserves every appearance option. */
test('portable custom skin round-trips without losing controls',()=>{
  const skin={...BASE_SKIN,name:'夜空',accent:'#813ab9',mode:'system',radius:0,density:'compact',backgroundOpacity:.4};
  assert.deepEqual(importSkin(exportSkin(skin)),skin);
  assert.equal(skinVariables(skin,true)['--radius'],'0px');
  assert.equal(skinVariables(skin,true)['--density'],.85);
});
/** 未受信导入不能包含CSS、远程图片、伪造格式或越界值。 Untrusted imports cannot carry CSS, remote images, forged formats or out-of-range values. */
test('invalid skin inputs and disguised backgrounds are rejected',()=>{
  const invalid=[{css:'body{}'},{schema:'other'},{version:2},{name:' '},{accent:'red'},{mode:'auto'},{radius:-1},{radius:25},{backgroundOpacity:.5},{density:'dense'},{backgroundImage:'https://example.com/a.png'},{backgroundImage:'data:image/svg+xml;base64,PHN2Zy8+'},{backgroundImage:'data:image/png;base64,ZmFrZQ=='}];
  for(const value of invalid)assert.throws(()=>validateSkin({...BASE_SKIN,...value}));
  assert.throws(()=>importSkin('x'.repeat(2900001)));
});
/** 命名保存应可覆盖和恢复，存储失败不能改变之前内容。 Named profiles can be replaced and restored while storage failure preserves old content. */
test('named profiles persist and quota failure preserves previous preference',()=>{
  let raw=null;
  const storage={/** 读取受控本地值。 Read the controlled local value. */getItem(){return raw;},/** 保存受控本地值。 Save the controlled local value. */setItem(key,value){raw=value;}};
  let profiles=saveSkins(storage,BASE_SKIN,[]);
  profiles=saveSkins(storage,{...BASE_SKIN,name:'夜空',mode:'dark'},profiles);
  assert.equal(profiles.length,2);
  assert.equal(loadSkins(storage).active.mode,'dark');
  profiles=saveSkins(storage,{...BASE_SKIN,name:'夜空',radius:19},profiles);
  assert.equal(profiles.length,2);
  const before=raw;
  assert.throws(()=>saveSkins({/** 模拟浏览器存储配额失败。 Simulate browser quota exhaustion. */setItem(){throw new Error('quota');}},BASE_SKIN,profiles),/存储空间/);
  assert.equal(raw,before);
});
/** 任意主色仍应选择可辨识的按钮前景。 Arbitrary accents retain readable button foreground. */
test('extreme accent colors choose contrasting controls',()=>{
  assert.equal(skinVariables({...BASE_SKIN,accent:'#ffffff'},false)['--accent-contrast'],'#142235');
  assert.equal(skinVariables({...BASE_SKIN,accent:'#000000'},true)['--accent-contrast'],'#ffffff');
  assert.notEqual(skinVariables({...BASE_SKIN,accent:'#ffffff'},false)['--accent-ink'],'#ffffff');
  assert.notEqual(skinVariables({...BASE_SKIN,accent:'#000000'},true)['--accent-ink'],'#000000');
});
/** 表单回传不能夹带执行权限或伪造在线状态。 Form submissions cannot carry execution permissions or forged online states. */
test('registration whitelist retains metadata and removes authority fields',()=>{
  const body=registrationBody('devices',{id:'sensor-review',name:'传感器',sourceRef:'manual:review',description:'',kind:'sensor',handedness:'',siteId:'',connectionState:'online',physicalExecutionEnabled:true});
  assert.equal(body.handedness,null);assert.equal(body.siteId,null);
  assert.equal('connectionState' in body,false);assert.equal('physicalExecutionEnabled' in body,false);
  assert.equal(editableRecord('sites',{unit:'mm'}).unit,'m');
  assert.equal(displayValue(undefined,'archived'),'使用中');
});
/** 标定期限在本地输入和带时区提交间保持同一分钟。 Calibration expiry preserves the same minute across local input and zoned submission. */
test('local calibration datetime preserves the recorded instant',()=>{
  const time='2026-09-13T12:30:00Z';
  const input=localDateInput(time);
  const result=registrationBody('calibrations',{id:'calibration',name:'标定',sourceRef:'manual:review',deviceId:'sensor',frameId:'world',method:'实测',expiresAt:input});
  assert.equal(new Date(result.expiresAt).getTime(),new Date(time).getTime());
});
