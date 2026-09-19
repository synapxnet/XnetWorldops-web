/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：登记目录及表单字段契约。Purpose: Registration catalogs and form contracts.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
const common=[{key:'id',label:'资料标识',required:true,max:96},{key:'name',label:'名称',required:true,max:100},{key:'sourceRef',label:'来源引用',required:true,max:160,help:'使用 manual:、memory: 或 registry: 开头的来源标识。'},{key:'description',label:'说明',type:'textarea',max:500}];
export const CATALOGS={
 devices:{title:'设备登记',singular:'设备',icon:'◎',description:'登记设备及其来源，查看能力和观测，保留每次修改。',fields:[...common,{key:'kind',label:'设备类型',type:'select',required:true,options:[['hand','灵巧手'],['headset','头显'],['camera','摄像头'],['robot','机器人'],['sensor','传感器'],['iot','物联网终端']]},{key:'handedness',label:'侧别',type:'select',options:[['','不适用'],['right','右侧'],['left','左侧']]},{key:'siteId',label:'场地标识',max:96,help:'可选，填写已登记且未归档的场地标识。'}],columns:[['name','设备'],['kind','类型'],['handedness','侧别'],['connectionState','WorldOps 观测'],['archived','登记状态']]},
 sites:{title:'场地资料',singular:'场地',icon:'◇',description:'为设备建立明确的位置与参考坐标；测量和标定分别保存。',fields:[...common,{key:'upAxis',label:'向上轴',type:'select',required:true,options:[['z','Z 轴'],['y','Y 轴']]},{key:'coordinateSystem',label:'坐标系',type:'select',required:true,options:[['right-handed','右手坐标系'],['left-handed','左手坐标系']]}],columns:[['name','场地'],['upAxis','向上轴'],['unit','单位'],['sourceRef','来源'],['archived','状态']]},
 calibrations:{title:'标定资料',singular:'标定草稿',icon:'⌖',description:'登记标定方法、设备与坐标引用，实测结果接入前保持待核验。',fields:[...common,{key:'deviceId',label:'设备标识',required:true,max:96},{key:'frameId',label:'参考坐标标识',required:true,max:96},{key:'method',label:'标定方法',required:true,max:100},{key:'expiresAt',label:'记录到期时间',type:'datetime-local'}],columns:[['name','资料'],['deviceId','关联设备'],['frameId','参考坐标'],['status','核验'],['expiresAt','到期时间']]},
 'dataset-candidates':{title:'数据候选',icon:'▦',description:'从已封存的实验生成可移交候选，保留来源与版本；提交至 DataOps 前先在当前项目审阅。',columns:[['name','候选'],['episodeId','来源记录'],['executionMode','模式'],['deliveryState','交接状态'],['createdAt','创建时间']]},
 'audit-entries':{title:'变更记录',icon:'≋',description:'资料登记、编辑、归档和恢复均留下前后版本，可按资源名称或标识追查。',columns:[['resourceName','资料'],['action','操作'],['resourceKind','类型'],['createdAt','时间']]},
 environments:{title:'仿真环境',icon:'◇',description:'从固定场景读取模型、单位和版本，确保实验有一致的环境依据。',columns:[['name','环境'],['engine','求解器'],['engineVersion','版本'],['fixedTimestepSeconds','物理步长（秒）'],['availability','状态']]}
};
export const LABELS={imported:'登记资料',native:'原生记录','local-project-credential':'项目授权身份',hand:'灵巧手',headset:'头显',camera:'摄像头',robot:'机器人',sensor:'传感器',iot:'物联网终端',right:'右侧',left:'左侧',not_connected:'未接入',draft:'待核验',local_draft:'项目候选',not_sent:'未提交',simulation:'内部仿真',replay:'历史回放',live:'真实',create:'登记',update:'编辑',archive:'归档',restore:'恢复',available:'可用',unavailable:'不可用',succeeded:'已完成',failed:'失败',interrupted:'已中断',running:'计算中',observation:'环境观测',action:'候选动作',receipt:'执行回执',devices:'设备',sites:'场地',calibrations:'标定', 'dataset-candidates':'数据候选'};
/** 按字段语境格式化真实值，平台暂无观测不表示硬件离线。 Format source values in field context without treating absent platform observations as offline hardware. */
export function displayValue(value,key='',collection=''){
  if(key==='archived')return value?'已归档':'使用中';
  if(value===null||value===undefined||value==='')return '未提供';
  if(key==='connectionState'&&value==='not_connected')return '暂无观测';
  if(key==='availability'&&collection==='devices')return ({available:'WorldOps 观测可用',unavailable:'WorldOps 暂无观测',empty:'WorldOps 暂无观测'}[value]||LABELS[value]||String(value));
  if(typeof value==='boolean')return value?'是':'否';
  if(key.endsWith('At')){const date=new Date(value);return Number.isNaN(date.getTime())?'时间未知':date.toLocaleString('zh-CN');}
  if(typeof value==='object')return JSON.stringify(value,null,2);
  return LABELS[value]||String(value);
}

/** 每类资料先展示完成当前任务需要的业务属性。 Prioritize the business properties needed for each catalog task. */
const DETAIL_FIELDS={
  devices:{title:'设备信息',keys:['kind','handedness','siteId','manufacturer','model','firmwareVersion','driverVersion','capabilities','connectionState','lastObservedAt','availability','registeredAt','reason']},
  sites:{title:'场地信息',keys:['upAxis','coordinateSystem','unit','registeredAt','availability','reason']},
  calibrations:{title:'标定信息',keys:['deviceId','frameId','method','status','verifiedAt','expiresAt','registeredAt','reason']},
  'dataset-candidates':{title:'交接信息',keys:['purpose','episodeId','executionMode','deliveryState','status','createdAt']},
  'audit-entries':{title:'变更信息',keys:['resourceKind','action','actor','createdAt']},
  environments:{title:'环境参数',keys:['engine','engineVersion','fixedTimestepSeconds','executionMode','availability','taskRef','reason']}
};

/** 仅分组展示字段，保留未分类字段及完整原始记录的访问。 Group fields for presentation while retaining uncategorized fields and access to the full record. */
export function registrationDetailGroups(collection,record){
  const definition=DETAIL_FIELDS[collection]||{title:'主要属性',keys:[]};
  const value=record||{};
  const primary=[];
  for(const key of definition.keys)if(Object.hasOwn(value,key))primary.push([key,value[key]]);
  const provenance=[];
  for(const [key,item] of Object.entries(value)){
    if(definition.keys.includes(key)||['name','resourceName','description','archived','limitations'].includes(key))continue;
    provenance.push([key,item]);
  }
  return {title:definition.title,primary,provenance};
}
/** 创建明确来源的登记草稿。 Create a registration draft with explicit manual provenance. */
export function newRecord(collection,id){const base={id,name:'',sourceRef:'manual:worldops-local-registration',description:'',archived:false};if(collection==='devices')return {...base,kind:'sensor',handedness:'',siteId:''};if(collection==='sites')return {...base,upAxis:'z',coordinateSystem:'right-handed',unit:'m'};return {...base,deviceId:'',frameId:'',method:'',expiresAt:''};}
/** 只保留可编辑字段，不能回传服务端权限和观测。 Keep editable fields only, excluding server permissions and observations. */
export function editableRecord(collection,record){const result={archived:record.archived===true};for(const field of CATALOGS[collection].fields)result[field.key]=record[field.key]??'';if(collection==='sites')result.unit='m';return result;}
/** 转换空引用和本地日期，其他字段保持用户输入。 Normalize empty references and local dates while retaining user input. */
export function registrationBody(collection,draft){const result=editableRecord(collection,draft);for(const key of ['handedness','siteId'])if(key in result&&!result[key])result[key]=null;if(collection==='calibrations')result.expiresAt=result.expiresAt?new Date(result.expiresAt).toISOString():null;return result;}
/** 为日期输入转换本地时间，不丢失时区偏移。 Convert timestamps for local datetime inputs without dropping the offset. */
export function localDateInput(value){if(!value)return '';const date=new Date(value);if(Number.isNaN(date.getTime()))return '';return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
