<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：可访问详情弹层。Purpose: Accessible detail dialog.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {ref,onMounted,onBeforeUnmount,onUpdated,nextTick} from 'vue';
const props=defineProps({title:String,busy:Boolean});
const emit=defineEmits(['close']);
const panel=ref(null);let previousFocus;
/** 限制焦点在弹层内，Escape请求关闭。 Trap focus inside the dialog and request close on Escape. */
function onKey(event){
  if(event.key==='Escape'){event.preventDefault();if(!props.busy)emit('close');return;}
  if(event.key!=='Tab'||!panel.value)return;
  const items=Array.from(panel.value.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')).filter(visible);
  if(!items.length){event.preventDefault();panel.value.focus();return;}
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&(document.activeElement===first||document.activeElement===panel.value)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
}
/** 排除隐藏的焦点目标。 Exclude hidden focus targets. */
function visible(item){return item.getClientRects().length>0;}
/** 记住入口并聚焦弹层，阻止背景滚动。 Remember the trigger, focus the dialog and suspend background scrolling. */
async function mount(){previousFocus=document.activeElement;await nextTick();panel.value?.focus();document.addEventListener('keydown',onKey);document.body.classList.add('dialog-open');}
/** 解除监听并把焦点归还可用入口。 Remove listeners and return focus to the available trigger. */
function dispose(){document.removeEventListener('keydown',onKey);document.body.classList.remove('dialog-open');if(previousFocus?.isConnected)previousFocus.focus();}
/** 表单与详情切换后仍将焦点保持在弹层内。 Keep focus inside the dialog after switching form and detail content. */
function maintainFocus(){if(panel.value&&!panel.value.contains(document.activeElement))panel.value.focus();}
onMounted(mount);onUpdated(maintainFocus);onBeforeUnmount(dispose);
</script>
<template><div class="dialog-backdrop" @click.self="!busy&&emit('close')"><section ref="panel" class="panel-dialog" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1"><header><div><span class="eyebrow">WORLDOPS / DETAIL</span><h2>{{title}}</h2></div><button type="button" class="icon-button" aria-label="关闭详情" :disabled="busy" @click="emit('close')">×</button></header><div class="dialog-content"><slot/></div><footer v-if="$slots.footer"><slot name="footer"/></footer></section></div></template>
