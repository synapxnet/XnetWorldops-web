<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：本地资料登记、编辑和详情。Purpose: Local registration, editing and detail.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {computed,onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {request} from './api.js';
import {CATALOGS,displayValue,newRecord,editableRecord,registrationBody,localDateInput,registrationDetailGroups} from './catalog.js';
import {downloadJson} from './skins.js';
import PanelDialog from './PanelDialog.vue';
const props=defineProps({collection:{type:String,required:true},project:{type:String,required:true}});
const emit=defineEmits(['changed','run-environment']);
const rows=ref([]),total=ref(null),cursor=ref(null),query=ref(''),filter=ref('active'),loading=ref(false),error=ref(''),notice=ref('');
const detail=ref(null),dialog=ref(''),draft=ref({}),saving=ref(false),formError=ref(''),original=ref(''),observation=ref(null),loadingDetail=ref(false),confirmArchive=ref(false),references=ref([]),referenceError=ref('');
let generation=0,detailGeneration=0;
/** 解析当前资料页配置。 Resolve the current catalog configuration. */
const config=computed(()=>CATALOGS[props.collection]);
/** 将详情拆为业务属性和可展开的来源字段，不改变记录。 Separate business properties from expandable provenance without modifying records. */
const detailGroups=computed(()=>registrationDetailGroups(props.collection,detail.value));
/** 摘要只描述登记或该目录业务状态，不推断硬件连接。 Summarize registration or catalog state without inferring hardware connectivity. */
const detailStatus=computed(()=>{
  if(!detail.value)return '';
  if(detail.value.archived===true)return '已归档';
  if(props.collection==='devices')return '已登记';
  return displayValue(detail.value.status||detail.value.availability,'status',props.collection);
});
/** 只比较可编辑草稿，判断是否有未保存修改。 Compare editable drafts to detect unsaved changes. */
const dirty=computed(()=>dialog.value==='edit'&&JSON.stringify(draft.value)!==original.value);
/** 查询真实服务端目录，迟到页面不能覆盖新筛选。 Query the actual catalog without letting stale pages override new filters. */
async function load(append=false){if(append&&(!cursor.value||loading.value))return;const ticket=++generation;loading.value=true;error.value='';if(!append){rows.value=[];total.value=null;cursor.value=null;}const params=new URLSearchParams({pageSize:'20'});if(query.value.trim())params.set('q',query.value.trim());if(config.value.fields&&filter.value)params.set('status',filter.value);if(append)params.set('cursor',cursor.value);try{const result=await request('/'+props.collection+'?'+params,props.project);if(ticket!==generation)return;rows.value=append?[...rows.value,...result.items]:result.items;total.value=result.total;cursor.value=result.nextCursor;}catch(cause){if(ticket===generation)error.value=cause.message;}finally{if(ticket===generation)loading.value=false;}}
/** 从事件绑定读取第一页。 Read the first page from an event handler. */
function reload(){load(false);}
/** 继续读取下一页，不重置现有资料。 Read the next page without resetting current data. */
function more(){load(true);}
/** 查看最新详情与观测，缺少观测保持未知。 Read current detail and observation without inventing missing telemetry. */
async function openDetail(item){const ticket=++detailGeneration;dialog.value='detail';confirmArchive.value=false;detail.value=null;observation.value=null;loadingDetail.value=true;formError.value='';try{const result=await request('/'+props.collection+'/'+encodeURIComponent(item.id),props.project);if(ticket!==detailGeneration)return;detail.value=result;if(props.collection==='devices'){const latest=await request('/devices/'+encodeURIComponent(item.id)+'/observations/latest',props.project);if(ticket===detailGeneration)observation.value=latest;}}catch(cause){if(ticket===detailGeneration)formError.value=cause.message;}finally{if(ticket===detailGeneration)loadingDetail.value=false;}}
/** 创建带稳定本地标识的草稿，失败重试保留同一标识。 Create a stable draft identity retained across failed saves. */
function create(){detail.value=null;draft.value=newRecord(props.collection,props.collection.replace(/s$/,'')+'_'+crypto.randomUUID().slice(0,8));original.value=JSON.stringify(draft.value);dialog.value='edit';formError.value='';loadReferences();}
/** 按白名单编辑当前版本。 Edit the current version using an explicit field whitelist. */
function edit(){if(!detail.value)return;draft.value=editableRecord(props.collection,detail.value);if(props.collection==='calibrations')draft.value.expiresAt=localDateInput(draft.value.expiresAt);original.value=JSON.stringify(draft.value);dialog.value='edit';formError.value='';loadReferences();}
/** 有草稿时先保留或由用户明确放弃，不丢失保存请求。 Preserve drafts unless explicitly discarded and do not leave during save. */
function canLeave(){if(saving.value)return false;return !dirty.value||window.confirm('还有未保存的修改，确定放弃这些修改吗？');}
/** 关闭详情并作废迟到的响应。 Close the dialog and invalidate late responses. */
function close(){if(!canLeave())return;++detailGeneration;dialog.value='';detail.value=null;draft.value={};formError.value='';loadingDetail.value=false;}
/** 持久化真实登记，冲突与错误保留草稿。 Persist registration while preserving drafts on errors and version conflicts. */
async function save(){if(saving.value)return;saving.value=true;formError.value='';try{const record=registrationBody(props.collection,draft.value);const path='/'+props.collection+(detail.value?'/'+encodeURIComponent(detail.value.id)+'/update':'');const body=detail.value?{expectedResourceVersion:detail.value.resourceVersion,record}:record;const result=await request(path,props.project,{method:'POST',body:JSON.stringify(body)});detail.value=result;dialog.value='detail';notice.value='资料已保存，变更记录已保留。';emit('changed');await load();}catch(cause){formError.value=cause.message;}finally{saving.value=false;}}
/** 归档或恢复元数据，不删除实验记录或操作设备。 Archive or restore metadata without deleting experiments or operating devices. */
async function toggleArchive(){if(!detail.value||saving.value)return;if(!confirmArchive.value){confirmArchive.value=true;return;}saving.value=true;formError.value='';try{const record=registrationBody(props.collection,{...detail.value,archived:!detail.value.archived});detail.value=await request('/'+props.collection+'/'+encodeURIComponent(detail.value.id)+'/update',props.project,{method:'POST',body:JSON.stringify({expectedResourceVersion:detail.value.resourceVersion,record})});confirmArchive.value=false;notice.value=detail.value.archived?'资料已归档。':'资料已恢复。';emit('changed');await load();}catch(cause){formError.value=cause.message;}finally{saving.value=false;}}
/** 导出当前已授权详情为本地JSON。 Export the authorized current detail as local JSON. */
function exportDetail(){if(detail.value)downloadJson(props.collection+'-'+detail.value.id+'.json',detail.value);}
/** 监听项目和目录身份。 Observe project and catalog identity. */
function scope(){return props.project+'|'+props.collection;}
/** 页面离开时失效异步读取。 Invalidate asynchronous reads when leaving the page. */
function dispose(){++generation;++detailGeneration;}
/** 读取同项目有效关联资料，完整分页并保留手工输入。 Read active scoped references across pages while retaining manual input. */
async function loadReferences(){references.value=[];referenceError.value='';const collection=props.collection==='calibrations'?'devices':props.collection==='devices'?'sites':null;if(!collection)return;const ticket=++detailGeneration;try{let cursor=null;do{const params=new URLSearchParams({status:'active',pageSize:'100'});if(cursor)params.set('cursor',cursor);const result=await request('/'+collection+'?'+params,props.project);if(ticket!==detailGeneration)return;references.value.push(...result.items);cursor=result.nextCursor;}while(cursor);}catch{if(ticket===detailGeneration)referenceError.value='关联目录暂不可用，可手工输入已登记标识，保存时将重新验证。';}}
/** 为详情字段使用产品文案。 Use product labels for detail fields. */
function fieldLabel(key){if(props.collection==='devices'&&key==='availability')return 'WorldOps 观测可用性';if(key==='connectionState')return 'WorldOps 观测接入';for(const field of config.value.fields||[])if(field.key===key)return field.label;return ({resourceVersion:'资料版本',contentDigest:'内容摘要',createdAt:'创建时间',registeredAt:'登记时间',manufacturer:'制造商',model:'设备型号',firmwareVersion:'固件版本',driverVersion:'驱动版本',capabilities:'能力描述',handedness:'侧别',kind:'设备类型',siteId:'所属场地',taskRef:'任务引用',manifest:'数据候选清单',scene:'环境几何',updatedAt:'修改时间',connectionState:'观测接入',lastObservedAt:'最近观测时间',status:'状态',availability:'可用性',sourceOrigin:'来源类型',projectId:'项目',executionMode:'执行模式',archived:'归档状态',deliveryState:'交接状态',beforeVersion:'修改前版本',afterVersion:'修改后版本',resourceName:'资料名称',resourceId:'资料标识',resourceKind:'资料类型',actor:'操作身份',action:'操作',episodeId:'来源实验',episodeVersion:'实验版本',purpose:'数据用途',requestDigest:'请求摘要',deviceVersion:'设备资料版本',verifiedAt:'核验时间',unit:'单位',engine:'求解器',engineVersion:'求解器版本',fixedTimestepSeconds:'物理步长（秒）',reason:'状态说明',id:'资料标识',name:'名称',sourceRef:'来源引用',schemaVersion:'格式版本'}[key]||key);}
/** 取消归档确认，保持资料不变。 Cancel archive confirmation without changing metadata. */
function cancelArchive(){confirmArchive.value=false;}
watch(scope,reload);onMounted(reload);onBeforeUnmount(dispose);defineExpose({canLeave});
</script>
<template>
<section class="collection-panel registry-page">
  <div class="section-heading"><div><h2>{{config.title}}</h2><p>{{config.description}}</p></div><button v-if="config.fields" class="primary-button" @click="create">＋ 登记{{config.singular}}</button></div>
  <form class="filter-bar" @submit.prevent="reload"><label class="search-field"><span class="sr-only">搜索{{config.title}}</span><input v-model="query" maxlength="100" :placeholder="'搜索'+config.title+'名称或标识'"></label><select v-if="config.fields" v-model="filter" aria-label="登记状态筛选" @change="reload"><option value="active">使用中</option><option value="archived">已归档</option><option value="">全部登记</option></select><button class="secondary-button" type="submit" :disabled="loading">查询</button><button class="icon-button" type="button" aria-label="刷新目录" :disabled="loading" @click="reload">↻</button></form>
  <div v-if="error" class="message error" role="alert">{{error}}<button @click="reload">重试</button></div><p v-if="notice" class="message notice" role="status">{{notice}}</p>
  <div v-if="loading&&!rows.length" class="empty" role="status">正在读取资料…</div>
  <div v-else-if="!rows.length" class="empty"><span class="empty-symbol">{{config.icon}}</span><h3>{{error?'资料暂不可用':query?'未找到匹配资料':'这里还没有资料'}}</h3><p>{{error?'恢复连接后重新读取。':config.fields?'登记来源明确的资料，或更换筛选条件。':'完成对应的实验或资料操作后，会在这里保留记录。'}}</p></div>
  <div v-else class="table-scroll"><table><thead><tr><th v-for="[key,label] in config.columns" :key="key">{{label}}</th><th>操作</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id"><td v-for="[key] in config.columns" :key="key"><span :class="{'cell-title':key==='name'||key==='resourceName'}" :title="key==='connectionState'&&item[key]==='not_connected'?'WorldOps 观测尚未接入；此字段不表示硬件连接状态。':undefined">{{displayValue(item[key],key,collection)}}</span><small v-if="key==='name'">{{item.id}}</small></td><td><button class="quiet-button" @click="openDetail(item)">查看详情 ↗</button></td></tr></tbody></table></div>
  <div class="pagination-bar"><span>{{total===null?'尚未取得总数':`已载入 ${rows.length} / ${total} 条`}}</span><button v-if="cursor" class="secondary-button" :disabled="loading" @click="more">{{loading?'正在载入…':'载入下一页'}}</button></div>
</section>
<PanelDialog v-if="dialog" :title="dialog==='edit'?(detail?'编辑':'登记')+(config.singular||config.title):(detail?.name||detail?.resourceName||config.title+'详情')" :busy="saving" @close="close">
  <p v-if="formError" class="message error" role="alert">{{formError}}</p><p v-if="loadingDetail" role="status">正在读取详情…</p>
  <form v-if="dialog==='edit'" id="registration-form" class="record-form" @submit.prevent="save"><label v-for="field in config.fields" :key="field.key"><span>{{field.label}}<b v-if="field.required" class="required-mark"> *</b></span><textarea v-if="field.type==='textarea'" v-model="draft[field.key]" :maxlength="field.max" :required="field.required" :disabled="saving" rows="4"></textarea><select v-else-if="field.type==='select'" v-model="draft[field.key]" :required="field.required" :disabled="saving"><option v-for="[value,label] in field.options" :key="value" :value="value">{{label}}</option></select><input v-else :list="['siteId','deviceId'].includes(field.key)?'registration-references':undefined" v-model="draft[field.key]" :type="field.type||'text'" :maxlength="field.max" :required="field.required" :disabled="saving||!!detail&&field.key==='id'"><small v-if="field.help">{{field.help}}</small></label><datalist id="registration-references"><option v-for="item in references" :key="item.id" :value="item.id">{{item.name}}</option></datalist><p v-if="referenceError" class="form-note">{{referenceError}}</p><p v-if="collection==='devices'" class="form-note">登记只保存资料，观测与设备控制需要独立接入。</p><p v-if="collection==='calibrations'" class="form-note">保存为待核验草稿，不会将设备标记为已完成标定。</p></form>
  <div v-else-if="detail" class="registry-detail">
    <div class="record-summary">
      <span class="record-category">{{config.singular||config.title}}</span>
      <span class="mode-badge">{{detailStatus}}</span>
      <p v-if="detail.description" class="record-description">{{detail.description}}</p>
    </div>
    <section v-if="collection==='devices'&&observation" class="record-observation" aria-label="WorldOps观测">
      <div><h3>WorldOps 观测</h3><span>{{observation.observation?'已取得观测':'暂无观测'}}</span></div>
      <p v-if="!observation.observation">平台尚未取得该设备的观测，硬件连接状态以设备端反馈为准。</p>
      <p v-for="item in observation.limitations||[]" :key="item">{{item}}</p>
    </section>
    <section v-if="detailGroups.primary.length" class="record-properties">
      <h3>{{detailGroups.title}}</h3>
      <dl class="record-property-grid"><div v-for="[key,value] in detailGroups.primary" :key="key"><dt>{{fieldLabel(key)}}</dt><dd><pre v-if="value!==null&&typeof value==='object'">{{displayValue(value,key,collection)}}</pre><template v-else>{{displayValue(value,key,collection)}}</template></dd></div></dl>
    </section>
    <details class="record-provenance">
      <summary tabindex="0">来源与版本</summary>
      <dl class="record-provenance-grid"><div v-for="[key,value] in detailGroups.provenance" :key="key"><dt>{{fieldLabel(key)}}</dt><dd><pre v-if="value!==null&&typeof value==='object'">{{displayValue(value,key,collection)}}</pre><template v-else>{{displayValue(value,key,collection)}}</template></dd></div></dl>
      <details class="record-raw"><summary tabindex="0">完整原始记录</summary><pre>{{JSON.stringify(detail,null,2)}}</pre></details>
    </details>
    <p v-for="item in detail.limitations||[]" :key="item" class="form-note">{{item}}</p>
  </div>
  <p v-if="confirmArchive" class="message notice" role="status">{{detail?.archived?'恢复后资料将重新显示在使用中目录。':'归档保留全部历史，可在归档筛选中恢复。'}}<button @click="cancelArchive" :disabled="saving">取消</button></p><template #footer><button class="secondary-button" :disabled="saving" @click="close">关闭</button><template v-if="dialog==='edit'"><button class="primary-button" type="submit" form="registration-form" :disabled="saving">{{saving?'正在保存…':'保存资料'}}</button></template><template v-else-if="detail"><button v-if="config.fields" class="secondary-button" :disabled="saving" @click="toggleArchive">{{confirmArchive?(detail.archived?'确认恢复':'确认归档'):(detail.archived?'恢复登记':'归档登记')}}</button><button v-if="config.fields" class="primary-button" :disabled="saving||confirmArchive" @click="edit">编辑资料</button><button v-else class="primary-button" @click="exportDetail">导出详情</button></template></template>
</PanelDialog>
</template>

<style scoped>
.registry-detail { color: var(--text); }
.record-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 0 0 16px; }
.record-category { font-size: 13px; font-weight: 600; }
.record-description { flex-basis: 100%; margin: 2px 0 0; font-size: 14px; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-observation { padding: 12px 14px; margin-bottom: 20px; border-left: 3px solid var(--accent); background: var(--soft); border-radius: 0 6px 6px 0; }
.record-observation > div { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.record-observation h3, .record-properties > h3 { margin: 0; font-size: 14px; font-weight: 600; }
.record-observation > div > span { font-size: 13px; color: var(--muted); }
.record-observation p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
.record-property-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 0 24px; margin: 8px 0 20px; }
.record-property-grid > div { min-width: 0; padding: 11px 0; border-bottom: 1px solid var(--line); }
.record-property-grid dt, .record-provenance-grid dt { color: var(--muted); font-size: 12px; line-height: 1.5; }
.record-property-grid dd { margin: 4px 0 0; color: var(--text); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.record-provenance { padding: 12px 0 0; border-top: 1px solid var(--line); }
.record-provenance > summary, .record-raw > summary { cursor: pointer; font-size: 13px; color: var(--muted); padding: 3px 0; }
.record-provenance[open] > summary { color: var(--text); }
.record-provenance-grid { margin: 12px 0; }
.record-provenance-grid > div { display: grid; grid-template-columns: 116px minmax(0,1fr); gap: 14px; padding: 8px 0; }
.record-provenance-grid dd { min-width: 0; margin: 0; color: var(--muted); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.registry-detail pre { max-width: 100%; max-height: 280px; overflow: auto; margin: 6px 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: var(--soft); color: var(--text); font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-raw { margin-top: 12px; }
@media (max-width: 600px) { .record-property-grid { grid-template-columns: minmax(0,1fr); } .record-provenance-grid > div { grid-template-columns: minmax(0,1fr); gap: 4px; } }
</style>
