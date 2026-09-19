<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：物理世界本地工作台。Purpose: Local physical world workbench.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {computed,onMounted,onBeforeUnmount,ref} from 'vue';
import WorldScene from './WorldScene.vue';
import WorkspaceIcon from './WorkspaceIcon.vue';
import RegistryPage from './RegistryPage.vue';
import EvidencePage from './EvidencePage.vue';
import SkinPage from './SkinPage.vue';
import {BASE_SKIN,loadSkins,saveSkins,skinVariables} from './skins.js';
import {request} from './api.js';
import {relativeSeconds,operationKey,settledRun,playbackEnvironment,phase,simulationInput,rejectedBeforeExecution} from './model.js';
const tabs=[
{id:'studio',label:'空间实验台',icon:'◈',heading:'把想法，放进真实的物理规则。',description:'选择环境、运行仿真，再沿着记录回看每一步。'},
{id:'devices',label:'设备与场地',icon:'◎',heading:'连接空间里的每一个感知端。',description:'管理设备、场地与来源，随时查看登记和观测状态。'},
{id:'episodes',label:'观测与实验库',icon:'▦',heading:'每一段经历，都有来处。',description:'查找实验、比较版本，让观测与行动形成可追溯的记录。'},
{id:'runs',label:'仿真与评估',icon:'◇',heading:'每一次实验，都留下来。',description:'对照环境版本与内部验收结果，找到下一次改进的依据。'},
{id:'actions',label:'动作与回执',icon:'⇄',heading:'让每一个动作，有据可查。',description:'从候选动作到执行回执，回看每一步实际发生了什么。'},
{id:'safety',label:'标定与安全',icon:'⌖',heading:'在行动之前，认识边界。',description:'管理标定依据、观测接入和执行能力，保持状态清晰。'},
{id:'handoff',label:'数据交接',icon:'↗',heading:'把实验，变成下一次学习的起点。',description:'审阅项目数据候选，保留原始实验的版本、用途和来源。'},
{id:'connections',label:'平台连接',icon:'⌘',heading:'让各个平台，共同完成一个目标。',description:'数据、模型、运行保障与物理反馈保持各自的真实来源。'},
{id:'settings',label:'外观与记录',icon:'◐',heading:'一个适合你的工作空间。',description:'定制皮肤，管理本机偏好，查看资料变更记录。'}];
const deploymentMode=ref('local');
const view=ref('studio'),project=ref('local-world'),capabilities=ref(null),environments=ref([]),devices=ref([]),episodes=ref([]),runs=ref([]),episodeCursor=ref(null);
const selectedEnvironment=ref(''),episode=ref(null),index=ref(0),busy=ref(false),loading=ref(true),loadingEpisode=ref(false),error=ref(''),notice=ref(''),seed=ref(20260913),runReference=ref(''),scene=ref(null),dark=ref(false),playing=ref(false);
const pendingOperation=ref(null),management=ref(null),subview=ref('devices');
const activeSkin=ref({...BASE_SKIN}),previewSkin=ref({...BASE_SKIN}),skinProfiles=ref([{...BASE_SKIN}]),skinError=ref('');
let mediaQuery=null;
/** 从导航目录读取页面文案。 Read page copy from the navigation catalog. */
const pageInfo=computed(()=>{for(const tab of tabs)if(tab.id===view.value)return tab;return tabs[0];});
/** 从已验证皮肤计算受限样式变量。 Compute bounded CSS variables from the validated skin. */
const appearance=computed(()=>skinVariables(previewSkin.value,dark.value));
/** 根据皮肤和系统偏好决定明暗。 Resolve appearance from skin and system preference. */
function resolveTheme(){dark.value=previewSkin.value.mode==='dark'||previewSkin.value.mode==='system'&&Boolean(mediaQuery?.matches);}
/** 即时预览有效皮肤。 Preview a validated skin immediately. */
function previewAppearance(skin){previewSkin.value={...skin};resolveTheme();}
/** 原子保存命名款式，失败时保留已保存状态。 Save a named profile atomically, preserving saved state on failure. */
function saveAppearance(skin){skinError.value='';try{const profiles=saveSkins(localStorage,skin,skinProfiles.value);skinProfiles.value=profiles;activeSkin.value={...skin};previewAppearance(skin);}catch(cause){skinError.value=cause.message;}}
/** 删除命名皮肤，当前款式被删除时选择剩余首项。 Delete a named skin and select the remaining first profile if needed. */
function removeAppearance(name){const profiles=[];for(const skin of skinProfiles.value)if(skin.name!==name)profiles.push(skin);if(!profiles.length)return;const next=activeSkin.value.name===name?profiles[0]:activeSkin.value;try{skinProfiles.value=saveSkins(localStorage,next,profiles);if(activeSkin.value.name===name){activeSkin.value={...next};previewAppearance(next);}skinError.value='';}catch(cause){skinError.value=cause.message;}}
/** 切换子页面时保护待保存草稿。 Protect pending drafts when switching subpages. */
function selectSubview(id){if(id===subview.value)return;if(management.value?.canLeave&&!management.value.canLeave())return;subview.value=id;}
/** 由库页面进入实验台并读取原始记录。 Enter the studio and read original evidence from a library page. */
function replayEpisode(id){if(navigate('studio'))selectEpisode(id);}
/** 打开实验台的显式事件入口。 Open the studio from a component event. */
function goStudio(){navigate('studio');}
/** 从数据交接跳转到来源实验库。 Open the source evidence library from data handoff. */
function goEpisodes(){navigate('episodes');}
/** 保留浏览器前进后退，同时处理未保存草稿。 Preserve browser navigation while respecting unsaved drafts. */
function hashChanged(){const id=window.location.hash.slice(2);if(!tabs.some(validTab))return;if(!navigate(id,false))window.history.replaceState(null,'','#/'+view.value);/** 匹配允许的页面标识。 Match an allowed page identity. */function validTab(tab){return tab.id===id;}}

let episodeGeneration=0,refreshGeneration=0,navigationGeneration=0,timer=null;
/** 获取当前环境的实际版本对象。 Resolve the selected versioned environment. */
const environment=computed(()=>playbackEnvironment(environments.value,selectedEnvironment.value,null));
/** 历史记录只显示与其版本一致的环境。 Display only the environment version recorded by the episode. */
const sceneEnvironment=computed(()=>playbackEnvironment(environments.value,selectedEnvironment.value,episode.value));
/** 当前导航名称复用同一目录。 Reuse the navigation catalog for the current page name. */
const currentTabLabel=computed(()=>{for(const tab of tabs)if(tab.id===view.value)return tab.label;return '';});
/** 仅从当前Episode获得关键帧。 Derive keyframes exclusively from the selected episode. */
const timeline=computed(()=>episode.value?.timeline||[]);
/** 显示当前关键帧，不合成缺失记录。 Display the current keyframe without synthesizing records. */
const frame=computed(()=>timeline.value[index.value]);
/** 保留未知时间的空值。 Preserve unavailable relative timestamps. */
const currentTime=computed(()=>relativeSeconds(frame.value?.timestampNs,timeline.value[0]?.timestampNs));
/** 仿真可用性来自服务端能力。 Obtain simulation availability from backend capabilities. */
const canRun=computed(()=>capabilities.value?.simulation?.availability==='available' && environment.value?.availability==='available' && !busy.value);
/** 将已知运行状态映射为简明文字。 Map known run states to clear labels. */
function statusLabel(status){return {succeeded:'运行完成',failed:'运行失败',running:'计算中',interrupted:'运行中断',passed:'规则通过',not_connected:'未连接',unavailable:'不可用'}[status]||status||'未知';}
/** 格式化真实采集时间。 Format a recorded timestamp. */
function date(value){if(!value)return '未提供';const result=new Date(value);return Number.isNaN(result.getTime())?'时间未知':result.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
/** 更新主题并保存本机偏好。 Update the theme and persist the local preference. */
function toggleTheme(){const skin={...previewSkin.value,mode:dark.value?'light':'dark'};if(view.value==='settings'&&subview.value==='skins')previewAppearance(skin);else saveAppearance(skin);}
/** 停止阶段回放定时器。 Stop the keyframe playback timer. */
function pause(){playing.value=false;clearTimeout(timer);timer=null;}
/** 选择页面时结束隐藏的回放。 End playback when switching away from the scene. */
function navigate(id,updateHash=true){if(id===view.value)return true;if(management.value?.canLeave&&!management.value.canLeave())return false;++navigationGeneration;pause();view.value=id;subview.value={devices:'devices',runs:'runs',settings:'skins'}[id]||'';if(updateHash&&typeof window!=='undefined')window.location.hash='/'+id;return true;}
/** 手动定位关键帧，保留原始时间。 Seek a keyframe while retaining its recorded timestamp. */
function seek(value){pause();index.value=Math.max(0,Math.min(timeline.value.length-1,Number(value)));}
/** 推进阶段展示，不重新运行物理计算。 Advance stage presentation without rerunning physics. */
function tick(){if(!playing.value)return;if(index.value>=timeline.value.length-1){pause();return;}index.value++;timer=setTimeout(tick,850);}
/** 切换阶段回放，结尾再次播放从头开始。 Toggle stage playback and restart at the end. */
function togglePlay(){if(playing.value){pause();return;}if(!timeline.value.length)return;if(index.value>=timeline.value.length-1)index.value=0;playing.value=true;timer=setTimeout(tick,850);}
/** 加载指定Episode，迟到响应不能覆盖新选择。 Load an episode without allowing stale responses to replace newer selections. */
async function selectEpisode(id){const generation=++episodeGeneration;pause();index.value=0;episode.value=null;loadingEpisode.value=true;error.value='';try{const result=await request('/episodes/'+encodeURIComponent(id),project.value);if(generation===episodeGeneration)episode.value=result;}catch(cause){if(generation===episodeGeneration)error.value=cause.message;}finally{if(generation===episodeGeneration)loadingEpisode.value=false;}}
/** 读取本地项目的真实目录和能力，失败时清空旧资料。 Load actual local catalogs and clear stale data on failure. */
async function refresh(){const generation=++refreshGeneration;loading.value=true;error.value='';notice.value='';try{
  const infoResponse=await fetch('/local-info');if(!infoResponse.ok){if(infoResponse.status===401&&typeof window!=='undefined')window.dispatchEvent(new Event('worldops:unauthenticated'));throw new Error('工作台服务暂时无法连接');}const info=await infoResponse.json();project.value=info.projectId;deploymentMode.value=info.mode==='cloud'?'cloud':'local';
  const results=await Promise.all([request('/capabilities',project.value),request('/environments',project.value),request('/devices',project.value),request('/episodes',project.value),request('/simulation-runs',project.value)]);
  if(generation!==refreshGeneration)return;
  [capabilities.value]=results;environments.value=results[1].items;devices.value=results[2].items;episodes.value=results[3].items;episodeCursor.value=results[3].nextCursor;runs.value=results[4].items;
  if(!environments.value.some(matchesEnvironment))selectedEnvironment.value=environments.value[0]?.id||'';
}catch(cause){if(generation===refreshGeneration){capabilities.value=null;environments.value=[];devices.value=[];episodes.value=[];runs.value=[];episode.value=null;episodeCursor.value=null;loadingEpisode.value=false;++episodeGeneration;pause();error.value=cause.message;}}finally{if(generation===refreshGeneration)loading.value=false;}}
/** 判断当前环境是否仍在授权目录。 Check whether the current environment remains in the catalog. */
function matchesEnvironment(item){return item.id===selectedEnvironment.value;}
/** 请求更多已持久化Episode，复用项目绑定游标。 Load more persisted episodes using the project-bound cursor. */
async function loadMore(){if(!episodeCursor.value||loading.value)return;const generation=refreshGeneration;const cursor=episodeCursor.value;loading.value=true;try{const result=await request('/episodes?cursor='+encodeURIComponent(cursor),project.value);if(generation!==refreshGeneration)return;episodes.value.push(...result.items);episodeCursor.value=result.nextCursor;}catch(cause){if(generation===refreshGeneration)error.value=cause.message;}finally{if(generation===refreshGeneration)loading.value=false;}}
/** 创建受限本地仿真，网络重试继续使用同一幂等标识。 Create bounded local simulation and retain its identity across network retries. */
async function simulate(){if(!canRun.value)return;pause();error.value='';notice.value='';busy.value=true;
  const navigationAtStart=navigationGeneration;
  const episodeAtStart=episodeGeneration;
  try{const input=pendingOperation.value?.input||simulationInput(selectedEnvironment.value,seed.value,runReference.value);
  pendingOperation.value=operationKey(pendingOperation.value,input,crypto.randomUUID.bind(crypto));
  const result=await request('/simulation-runs',project.value,{method:'POST',headers:{'Idempotency-Key':pendingOperation.value.key},body:JSON.stringify(pendingOperation.value.input)});if(settledRun(result.status))pendingOperation.value=null;await refresh();if(navigationAtStart===navigationGeneration && episodeAtStart===episodeGeneration && view.value==='studio' && result.episodeId)await selectEpisode(result.episodeId);notice.value=result.status==='succeeded'?'仿真记录已保存，可以逐阶段回看。':settledRun(result.status)?`本次${statusLabel(result.status)}，记录已保留。`:'本次仍在计算中，可使用同一请求查询结果。';}
  catch(cause){if(rejectedBeforeExecution(cause.status))pendingOperation.value=null;error.value=cause.message;}finally{busy.value=false;}
}
/** 从运行记录打开其关联Episode。 Open the episode referenced by a run. */
function openRun(run){if(run.episodeId)replayEpisode(run.episodeId);}
/** 读取主题后加载本地服务。 Restore the theme then load the local service. */
function initialize(){mediaQuery=window.matchMedia('(prefers-color-scheme: dark)');mediaQuery.addEventListener('change',resolveTheme);try{const saved=loadSkins(localStorage);activeSkin.value=saved.active;skinProfiles.value=saved.profiles;previewAppearance(saved.active);}catch(cause){skinError.value='已保存皮肤无法读取，当前使用品牌默认款式。'+cause.message;}window.addEventListener('hashchange',hashChanged);hashChanged();resolveTheme();refresh();}
/** 离页时失效所有待返回请求并停止回放。 Invalidate pending requests and stop playback on unmount. */
function dispose(){++episodeGeneration;++refreshGeneration;pause();mediaQuery?.removeEventListener('change',resolveTheme);if(typeof window!=='undefined')window.removeEventListener('hashchange',hashChanged);}
onMounted(initialize);onBeforeUnmount(dispose);
</script>

<template>
<div class="worldops" :class="{'is-dark':dark,'is-compact':previewSkin.density==='compact'}" :style="appearance">
  <aside class="sidebar">
    <a class="brand" href="/" @click.prevent="goStudio" aria-label="XnetWorldOps 首页"><img src="/logo.png" alt="SynapXnet"><span>Xnet<span class="brand-light">WorldOps</span><small>物理世界工作区</small></span></a>
    <div class="workspace-label"><span class="workspace-avatar">W</span><div><strong>{{deploymentMode==='cloud'?'云端工作空间':'本地工作空间'}}</strong><small>{{project}}</small></div></div>
    <nav aria-label="工作台导航"><button v-for="tab in tabs" :key="tab.id" :class="{active:view===tab.id}" :aria-current="view===tab.id?'page':undefined" @click="navigate(tab.id)"><WorkspaceIcon :name="tab.id"/><span class="nav-label">{{tab.label}}</span></button></nav>
    <div class="sidebar-bottom"><div class="local-status"><WorkspaceIcon name="connections"/> {{deploymentMode==='cloud'?'云端工作区':'本地运行'}}</div><small>SynapXnet · WorldOps 1.0.1</small></div>
  </aside>
  <main class="main">
    <header class="topbar"><div class="workspace-title"><WorkspaceIcon :name="view"/><h1>{{currentTabLabel}}</h1><span class="scope-label">{{deploymentMode==='cloud'?'授权项目':'本地项目'}}</span></div><div><span v-if="capabilities" class="mode-badge">仅仿真执行</span><button class="icon-button" v-if="view!=='settings'||subview!=='skins'" @click="toggleTheme" :aria-label="dark?'切换浅色主题':'切换深色主题'">{{dark?'☀':'☾'}}</button><button class="icon-button" @click="refresh" :disabled="loading||busy" aria-label="刷新工作台">↻</button></div></header>
    <div class="page-content">
      <div v-if="error" class="message error" role="alert"><b>暂时无法完成</b><span>{{error}}</span><button @click="refresh" :disabled="loading||busy">重新连接</button></div>
      <div v-if="notice" class="message notice" role="status">{{notice}}</div>
      <div v-if="loading&&!capabilities" class="empty loading" role="status">{{error?'等待服务连接':'正在连接工作台…'}}</div>
      <template v-if="view==='studio'">
        <div class="studio-layout">
          <section class="stage-panel" aria-label="空间实验台">
            <div class="stage-toolbar"><div><span class="live-dot"></span><strong>{{sceneEnvironment?.name||(episode?'原环境版本不可用':'选择一个仿真环境')}}</strong><span class="subtle">{{sceneEnvironment?.engineVersion?'v'+sceneEnvironment.engineVersion:''}}</span></div><button class="quiet-button" @click="scene?.resetView()">↗ 复位视角</button></div>
            <div class="scene-wrap"><WorldScene ref="scene" :frame="frame" :dark="dark" :environment="sceneEnvironment"/><div class="scene-label">{{episode?sceneEnvironment?'内部仿真 · 关键帧回放':'原环境版本不可用 · 仅显示记录坐标':'环境预览'}}</div><div v-if="!episode" class="scene-intro"><WorkspaceIcon name="episodes"/><div><h2>{{loadingEpisode?'正在读取记录':'尚未选择实验记录'}}</h2><p>选择实验记录开始回放，或在实验设置中运行。</p></div></div><div class="scene-legend"><span><i class="blue"></i>虚拟左夹爪</span><span><i class="violet"></i>虚拟右夹爪</span><span><i class="amber"></i>目标物体</span></div><span class="scene-hint">拖动旋转 · 滚轮缩放</span></div>
            <div class="playback"><button class="play-button" @click="togglePlay" :disabled="!timeline.length" :aria-label="playing?'暂停阶段回放':'播放阶段回放'">{{playing?'Ⅱ':'▶'}}</button><button class="icon-button" @click="seek(index-1)" :disabled="!timeline.length||index===0" aria-label="上一阶段">‹</button><button class="icon-button" @click="seek(index+1)" :disabled="!timeline.length||index>=timeline.length-1" aria-label="下一阶段">›</button><input type="range" min="0" :max="Math.max(0,timeline.length-1)" :value="index" :disabled="!timeline.length" @input="seek($event.target.value)" aria-label="关键帧位置"><span class="timecode">{{timeline.length?`${index+1} / ${timeline.length}`:'— / —'}}</span></div>
            <div class="stage-footnote"><span>{{frame?phase(frame.skillId):'等待实验记录'}} <b v-if="currentTime!==null">· 相对起点 {{currentTime.toFixed(2)}} s</b></span><span>阶段关键帧</span></div>
          </section>
          <aside class="experiment-panel"><span class="eyebrow">EXPERIMENT SETUP</span><h2>实验设置</h2><label>仿真环境<select v-model="selectedEnvironment" :disabled="busy||!!pendingOperation||!environments.length"><option v-for="item in environments" :key="item.id" :value="item.id">{{item.name}}</option><option v-if="!environments.length" value="">尚未取得环境</option></select></label><label>随机种子<input type="number" v-model="seed" min="0" max="2147483647" step="1" :disabled="busy||!!pendingOperation"></label><p class="field-help">固定种子和环境版本，便于重复实验。</p><details class="advanced"><summary>关联 OpenXnet 任务</summary><label>运行标识<input v-model="runReference" maxlength="96" placeholder="可选：已有运行标识" :disabled="busy||!!pendingOperation"></label><p>保存关联引用；企业项目授权尚未接通。</p></details><button class="primary-button run-button" @click="simulate" :disabled="!canRun">{{busy?'正在进行物理计算…':pendingOperation?'查询 / 重试本次运行':'运行一次仿真'}} <span v-if="!busy">↗</span></button><p class="execution-note">本次只运行隔离仿真。</p><div class="setup-divider"></div><span class="tiny-label">当前实验结果</span><div v-if="episode" class="result-summary"><strong :class="episode.verification?.success?'result-pass':'result-neutral'">{{episode.verification?.success===true?'内部规则通过':episode.verification?.success===false?'内部规则未通过':'尚无验证结论'}}</strong><dl><div><dt>观测记录</dt><dd>{{episode.observationCount??'—'}}</dd></div><div><dt>动作 / 回执</dt><dd>{{episode.actionCount??'—'}} / {{episode.receiptCount??'—'}}</dd></div></dl><p>依据固定内部规则，不属于官方评测成绩。</p></div><p v-else class="empty-result">运行完成后，在这里查看记录和内部验收结果。</p></aside>
        </div>
        <section class="history-panel"><div class="section-heading"><div><h2>最近的实验</h2><p>真实计算结果保存在当前项目中。</p></div><span>{{episodes.length}} 条已载入</span></div><div v-if="!episodes.length" class="inline-empty">{{capabilities?'还没有实验记录。完成第一次仿真后，即可回放和比较来源。':'服务恢复后显示实验记录。'}}</div><div v-else class="episode-list"><button v-for="item in episodes" :key="item.id" @click="selectEpisode(item.id)" :class="{selected:episode?.id===item.id}" :disabled="loadingEpisode"><span class="episode-icon">◈</span><span class="episode-copy"><strong>{{item.name||'物体交接实验'}}</strong><small>{{date(item.startedAt)}} · {{item.observationCount??'—'}} 次观测</small></span><span class="list-status">{{item.verification?.success?'规则通过':item.verification?.success===false?'规则未通过':'待验证'}}</span><span>↗</span></button></div><button v-if="episodeCursor" class="quiet-button" @click="loadMore" :disabled="loading">载入更早记录</button></section>
        <details v-if="episode" class="evidence-details"><summary>查看本次记录的来源与版本</summary><dl><div><dt>Episode</dt><dd>{{episode.id}}</dd></div><div><dt>环境版本</dt><dd>{{episode.environmentVersion}}</dd></div><div><dt>内容摘要</dt><dd>{{episode.contentDigest}}</dd></div></dl><p v-for="item in episode.verification?.limitations||[]" :key="item">{{item}}</p></details>
      </template>
      <template v-if="view==='devices'"><div class="subnav" aria-label="设备与场地视图"><button :class="{active:subview==='devices'}" @click="selectSubview('devices')">设备登记</button><button :class="{active:subview==='sites'}" @click="selectSubview('sites')">场地资料</button></div><RegistryPage ref="management" :key="subview+project" :collection="subview" :project="project" @changed="refresh"/></template>
      <EvidencePage v-if="view==='episodes'||view==='actions'" ref="management" :key="view+project" :kind="view" :project="project" @replay="replayEpisode" @studio="goStudio"/>
      <template v-if="view==='runs'"><div class="subnav" aria-label="仿真与评估视图"><button :class="{active:subview==='runs'}" @click="selectSubview('runs')">运行与比较</button><button :class="{active:subview==='environments'}" @click="selectSubview('environments')">仿真环境</button></div><EvidencePage v-if="subview==='runs'" ref="management" :key="project" kind="runs" :project="project" @replay="replayEpisode" @studio="goStudio"/><RegistryPage v-else ref="management" :key="'environments'+project" collection="environments" :project="project"/></template>
      <template v-if="view==='safety'"><div class="readiness-strip"><div><span>仿真能力</span><strong>{{capabilities?.simulation?.availability==='available'?'可用':'尚未取得'}}</strong></div><div><span>真实执行</span><strong>{{capabilities?'未启用':'尚未取得'}}</strong></div><div><span>设备观测</span><strong>{{capabilities?'待接入适配器':'尚未取得'}}</strong></div><p>标定资料需结合实测进行核验。保存资料不会开启设备控制。</p></div><RegistryPage ref="management" :key="'calibrations'+project" collection="calibrations" :project="project"/></template>
      <template v-if="view==='handoff'"><div class="handoff-banner"><span class="empty-symbol">↗</span><div><h2>创建数据候选</h2><p>打开实验详情，填写用途并创建数据候选，再在这里审阅和导出。</p></div><button class="primary-button" @click="goEpisodes">选择来源实验</button></div><RegistryPage ref="management" :key="'candidates'+project" collection="dataset-candidates" :project="project"/></template>
      <template v-if="view==='settings'"><div class="subnav" aria-label="外观与记录视图"><button :class="{active:subview==='skins'}" @click="selectSubview('skins')">皮肤工作室</button><button :class="{active:subview==='audit'}" @click="selectSubview('audit')">变更记录</button></div><p v-if="skinError" class="message error" role="alert">{{skinError}}</p><SkinPage v-if="subview==='skins'" ref="management" :active="activeSkin" :profiles="skinProfiles" @preview="previewAppearance" @save="saveAppearance" @remove="removeAppearance"/><RegistryPage v-else ref="management" :key="'audit'+project" collection="audit-entries" :project="project"/></template>
      <template v-if="view==='connections'"><section class="collection-panel"><div class="section-heading"><h2>领域平台连接</h2><span>连接状态</span></div><article v-for="platform in capabilities?.platforms||[]" :key="platform.platform" class="connection-row"><span class="connection-symbol">{{platform.platform==='dataops'?'▦':platform.platform==='mlops'?'◇':'⌘'}}</span><div><h3>{{{dataops:'XnetDataOps',mlops:'XnetMLOps',aiops:'XnetAIOps'}[platform.platform]||platform.platform}}</h3><p>{{platform.reason==='configured_offline'?'尚未配置服务连接，配置后进行验证。':platform.reason||'尚未建立连接'}}</p></div><span class="offline-status">未连接</span></article><div v-if="!capabilities" class="empty">WorldOps 服务未连接，暂时无法取得平台连接状态。</div><div class="connection-note"><h3>OpenXnet 统一组织协作</h3><p>当前支持在仿真记录中保留 OpenXnet 运行引用。跨平台数据发布与模型回传尚未接通，需要单独配置与联调。</p></div></section></template>
      <footer><span>{{project}}</span><span>物理执行尚未启用</span></footer>
    </div>
  </main>
</div>
</template>
