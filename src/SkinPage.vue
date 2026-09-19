<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：跨平台皮肤工作室。Purpose: Portable skin studio.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import {BASE_SKIN,validateSkin,importSkin,downloadJson} from './skins.js';
const props=defineProps({active:Object,profiles:Array});
const emit=defineEmits(['preview','save','remove']);
const draft=ref({...props.active}),error=ref(''),notice=ref(''),reading=ref(false);
let generation=0;
/** 判断预览是否尚未保存。 Detect unsaved preview changes. */
const dirty=computed(()=>JSON.stringify(draft.value)!==JSON.stringify(props.active));
/** 预览只影响当前窗口，保存后才改变偏好。 Preview this window without persisting preferences. */
function preview(){error.value='';try{emit('preview',validateSkin(draft.value));}catch(cause){error.value=cause.message;}}
/** 保存选定皮肤，存储失败由父页面反馈。 Save the selected skin with storage errors handled by the parent. */
function save(){error.value='';try{emit('save',validateSkin(draft.value));}catch(cause){error.value=cause.message;}}
/** 切换到已保存款式的预览。 Preview a saved named profile. */
function select(profile){if(dirty.value&&!window.confirm('放弃当前未保存的皮肤修改？'))return;++generation;reading.value=false;draft.value={...profile};preview();}
/** 恢复当前已保存皮肤。 Restore the active saved skin. */
function cancel(){++generation;reading.value=false;draft.value={...props.active};preview();notice.value='已恢复保存的皮肤。';}
/** 预览品牌初始样式。 Preview the original brand style. */
function reset(){++generation;reading.value=false;draft.value={...BASE_SKIN};preview();}
/** 显式删除本地已保存款式。 Explicitly delete a saved local profile. */
function remove(profile){if(profile.name===props.active.name&&dirty.value&&!window.confirm('删除正在编辑的当前款式会放弃未保存修改，继续吗？'))return;if(window.confirm('删除本机保存的“'+profile.name+'”皮肤？'))emit('remove',profile.name);}
/** 解码位图并约束像素数量，拒绝损坏的图片。 Decode bitmaps and bound pixel count, rejecting corrupt images. */
async function decodeImage(value){if(!value)return;const [header,encoded]=value.split(',');const binary=atob(encoded);const bytes=new Uint8Array(binary.length);for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);const bitmap=await createImageBitmap(new Blob([bytes],{type:header.slice(5,header.indexOf(';'))}));try{if(bitmap.width*bitmap.height>24000000)throw new Error('图片像素过大，请使用不超过 2400 万像素的背景');}finally{bitmap.close();}}
/** 从文件读取本地图片，不上传。 Read a local image without uploading it. */
async function upload(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;const ticket=++generation;error.value='';reading.value=true;try{if(file.size>2097152)throw new Error('背景图片最多 2 MB');const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);const value='data:'+file.type+';base64,'+btoa(text);validateSkin({...draft.value,backgroundImage:value});await decodeImage(value);if(ticket!==generation)return;draft.value.backgroundImage=value;preview();notice.value='背景已载入预览，保存后在本机生效。';}catch(cause){if(ticket===generation)error.value=cause.message||'无法读取图片';}finally{if(ticket===generation)reading.value=false;}}
/** 导入共享JSON并真实解码背景，失败保留原稿。 Import portable JSON and decode its background, preserving drafts on failure. */
async function importFile(event){const file=event.target.files?.[0];event.target.value='';if(!file)return;const ticket=++generation;reading.value=true;error.value='';try{if(file.size>2900000)throw new Error('皮肤文件过大');const skin=importSkin(await file.text());await decodeImage(skin.backgroundImage);if(ticket!==generation)return;draft.value=skin;preview();notice.value='导入完成，正在预览；点击保存即可保留。';}catch(cause){if(ticket===generation)error.value=cause.message||'皮肤文件无效';}finally{if(ticket===generation)reading.value=false;}}
/** 导出当前预览，可在其他Xnet平台导入。 Export the preview for import into other Xnet platforms. */
function exportFile(){try{const skin=validateSkin(draft.value);downloadJson(skin.name+'.synapxnet-skin.json',skin);notice.value='皮肤已导出。';}catch(cause){error.value=cause.message;}}
/** 清除草稿背景。 Clear the draft background. */
function clearBackground(){draft.value.backgroundImage='';preview();}
/** 保存完成后同步父级有效皮肤。 Synchronize the effective skin after saving. */
function saved(skin){++generation;reading.value=false;draft.value={...skin};notice.value='已保存到本机。';}
/** 离开前明确处理未保存的预览。 Explicitly resolve an unsaved preview before leaving. */
function canLeave(){if(reading.value)return false;if(dirty.value&&!window.confirm('当前皮肤尚未保存，放弃预览并离开？'))return false;emit('preview',props.active);return true;}
/** 离开后取消迟到的文件读取。 Ignore late file reads after leaving. */
function dispose(){++generation;}
/** 读取父级活动皮肤身份。 Read the parent active skin identity. */
function activeSkin(){return props.active;}
watch(activeSkin,saved);onBeforeUnmount(dispose);defineExpose({canLeave});
</script>
<template>
<div class="skin-layout"><section class="collection-panel"><div class="section-heading"><div><h2>外观设置</h2><p>实时预览主色、背景与界面密度。</p></div><span class="mode-badge">{{dirty?'预览中 · 未保存':'已保存'}}</span></div>
<p v-if="error" class="message error" role="alert">{{error}}</p><p v-if="notice" class="message notice" role="status">{{notice}}</p>
<form class="record-form skin-form" @submit.prevent="save" @input="preview" @change="preview"><label>皮肤名称<input v-model="draft.name" maxlength="60" required></label><label>主色<input v-model="draft.accent" type="color" aria-label="皮肤主色"></label><label>明暗模式<select v-model="draft.mode"><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label><label>紧凑度<select v-model="draft.density"><option value="comfortable">舒适</option><option value="compact">紧凑</option></select></label><label>圆角 · {{draft.radius}} px<input v-model.number="draft.radius" type="range" min="0" max="24"></label><label>背景透明度 · {{Math.round(draft.backgroundOpacity*100)}}%<input v-model.number="draft.backgroundOpacity" type="range" min="0" max="0.4" step="0.01"></label>
<div class="background-editor"><div class="background-thumb" :style="{backgroundImage:draft.backgroundImage?'url('+draft.backgroundImage+')':'none'}"><span v-if="!draft.backgroundImage">◇</span></div><div><h3>本地背景图片</h3><p>PNG、JPEG 或 WebP，最多 2 MB。</p><label class="file-button secondary-button">选择背景<input type="file" accept="image/png,image/jpeg,image/webp" :disabled="reading" @change.stop="upload"></label><button class="quiet-button" type="button" :disabled="!draft.backgroundImage||reading" @click="clearBackground">清除背景</button></div></div>
<div class="form-actions"><button class="secondary-button" type="button" @click="cancel" :disabled="reading">取消预览</button><button class="primary-button" type="submit" :disabled="reading">保存皮肤</button></div></form></section>
<aside class="skin-library collection-panel"><span class="eyebrow">MY COLLECTION</span><h2>已保存的款式</h2><div v-for="profile in profiles" :key="profile.name" class="skin-profile"><button @click="select(profile)"><i :style="{background:profile.accent}"></i><span>{{profile.name}}<small>{{profile.mode==='dark'?'深色':profile.mode==='system'?'跟随系统':'浅色'}} · {{profile.density==='compact'?'紧凑':'舒适'}}</small></span><b v-if="active.name===profile.name">使用中</b></button><button class="icon-button" :aria-label="'删除皮肤 '+profile.name" :disabled="profiles.length<=1" @click="remove(profile)">×</button></div><div class="skin-transfer"><h3>带到其他平台</h3><p>四个平台使用相同皮肤格式，背景图片随文件保存。</p><label class="file-button secondary-button">导入皮肤<input type="file" accept="application/json,.json" :disabled="reading" @change="importFile"></label><button class="secondary-button" @click="exportFile" :disabled="reading">导出当前皮肤</button><button class="quiet-button" @click="reset">预览品牌默认款式</button></div></aside></div>
</template>
