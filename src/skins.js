/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：跨平台皮肤验证和本地存储。Purpose: Portable skin validation and local storage.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
export const BASE_SKIN = Object.freeze({schema:'synapxnet.skin',version:1,name:'澄蓝',accent:'#187bbd',mode:'light',backgroundImage:'',backgroundOpacity:.12,radius:12,density:'comfortable'});
const STORAGE_KEY='worldops-skins-v1';
const FIELDS=Object.keys(BASE_SKIN);
/** 验证四平台通用皮肤，禁止脚本、任意CSS及远程图片。 Validate a portable skin without scripts, arbitrary CSS or remote images. */
export function validateSkin(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(unknownField))throw new Error('皮肤包含不支持的字段');
  if(input.schema!=='synapxnet.skin'||input.version!==1)throw new Error('不支持此皮肤版本');
  if(typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>60)throw new Error('皮肤名称需要 1 至 60 个字符');
  if(typeof input.accent!=='string'||!/^#[a-f\d]{6}$/i.test(input.accent))throw new Error('主色必须为六位颜色值');
  if(!['light','dark','system'].includes(input.mode)||!['comfortable','compact'].includes(input.density))throw new Error('皮肤模式或紧凑度无效');
  if(!Number.isFinite(input.radius)||input.radius<0||input.radius>24||!Number.isFinite(input.backgroundOpacity)||input.backgroundOpacity<0||input.backgroundOpacity>.4)throw new Error('圆角或背景透明度超出范围');
  validateImage(input.backgroundImage);
  return {...input,name:input.name.trim(),accent:input.accent.toLowerCase()};
}
/** 仅允许契约内的字段。 Accept only fields from the shared contract. */
function unknownField(key){return !FIELDS.includes(key);}
/** 检查内嵌位图格式、字节头及大小，不接受SVG。 Check inline bitmap type, signature and size while rejecting SVG. */
export function validateImage(value){
  if(value==='')return;
  if(typeof value!=='string'||value.length>2800000)throw new Error('背景图片最多 2 MB');
  const match=/^data:image\/(png|jpeg|webp);base64,([A-Za-z\d+/]+={0,2})$/.exec(value);
  if(!match)throw new Error('背景仅支持本地 PNG、JPEG 或 WebP 图片');
  let bytes;try{bytes=atob(match[2]);}catch{throw new Error('背景图片编码无效');}
  if(bytes.length>2097152)throw new Error('背景图片最多 2 MB');
  const valid=match[1]==='png'?bytes.startsWith('\x89PNG\r\n\x1a\n'):match[1]==='jpeg'?bytes.startsWith('\xff\xd8\xff'):bytes.startsWith('RIFF')&&bytes.slice(8,12)==='WEBP';
  if(!valid)throw new Error('图片内容与声明格式不匹配');
}
/** 读取命名皮肤，损坏资料不替代默认工作界面。 Load named skins without allowing corrupted data to break the workbench. */
export function loadSkins(storage){
  const raw=storage.getItem(STORAGE_KEY);
  if(!raw)return {active:{...BASE_SKIN},profiles:[{...BASE_SKIN}]};
  const data=JSON.parse(raw);
  if(!Array.isArray(data.profiles)||data.profiles.length<1||data.profiles.length>12)throw new Error('已保存皮肤目录无效');
  const profiles=data.profiles.map(validateSkin);
  const active=profiles.find(matchesActive);
  /** 按名称解析已保存的当前皮肤。 Resolve the saved active skin by name. */
  function matchesActive(item){return item.name===data.active;}
  if(!active)throw new Error('找不到已保存的当前皮肤');
  return {active,profiles};
}
/** 原子保存皮肤目录，配额失败保留原偏好。 Save the skin catalog atomically, retaining prior preferences on quota failure. */
export function saveSkins(storage,skin,profiles){
  const active=validateSkin(skin),next=[];
  for(const item of profiles){const valid=validateSkin(item);if(valid.name!==active.name)next.push(valid);}
  next.push(active);if(next.length>12)throw new Error('最多保存 12 款皮肤，请先删除不用的款式');
  try{storage.setItem(STORAGE_KEY,JSON.stringify({active:active.name,profiles:next}));}catch{throw new Error('本机皮肤存储空间不足，请缩小背景图片，或先导出再删除不用的皮肤');}
  return next;
}
/** 读取有限尺寸的导入JSON。 Parse a bounded imported JSON skin. */
export function importSkin(text){if(typeof text!=='string'||text.length>2900000)throw new Error('皮肤文件过大');return validateSkin(JSON.parse(text));}
/** 将有效皮肤转换为可导出的跨平台JSON。 Serialize a valid portable skin for export. */
export function exportSkin(skin){return JSON.stringify(validateSkin(skin),null,2);}
/** 将颜色转成相对亮度以选择可读按钮文字。 Convert color to relative luminance for readable button labels. */
function luminance(hex){const values=[1,3,5].map(channel);/** 解码并线性化颜色通道。 Decode and linearize a color channel. */function channel(offset){const value=parseInt(hex.slice(offset,offset+2),16)/255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}return values[0]*.2126+values[1]*.7152+values[2]*.0722;}
/** 生成受限样式变量，动态主色仍保持文字对比。 Produce bounded style variables with readable accent text. */
export function skinVariables(skin,dark){
  const valid=validateSkin(skin),channels=[1,3,5].map(readChannel);let ink=valid.accent;
  /** 读取当前主色通道。 Read an accent channel. */
  function readChannel(offset){return parseInt(valid.accent.slice(offset,offset+2),16);}
  const surface=dark?'#182131':'#ffffff';
  for(let step=0;step<=20;step++){const amount=step/20;ink='#';for(const value of channels)ink+=Math.round(value*(1-amount)+(dark?255:0)*amount).toString(16).padStart(2,'0');const a=luminance(ink),b=luminance(surface);if((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5)break;}
  return {'--accent':valid.accent,'--accent-ink':ink,'--accent-contrast':luminance(valid.accent)>.179?'#142235':'#ffffff','--blue':valid.accent,'--radius':`${valid.radius}px`,'--density':valid.density==='compact'?.85:1,'--skin-image':valid.backgroundImage?`url("${valid.backgroundImage}")`:'none','--skin-opacity':valid.backgroundOpacity};
}
/** 下载本地生成的资料，不向外部服务发送。 Download locally generated data without sending it to another service. */
export function downloadJson(name,value){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();/** 下载开始后释放对象URL。 Release the object URL after download starts. */setTimeout(()=>URL.revokeObjectURL(url),1000);}
