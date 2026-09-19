<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：工作区统一矢量图标。Purpose: Consistent vector icons for the workspace.
Author: maoyo | Department: 研发部 | Date: 2026-09-14
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
defineProps({name:{type:String,required:true}});
const paths={
  studio:['M3 7l9-5 9 5v10l-9 5-9-5Z','M3 7l9 5 9-5M12 12v10'],
  devices:['M8 3h8v18H8zM3 8h5M16 8h5M3 16h5M16 16h5','M11 7h2M11 17h2'],
  episodes:['M4 3h12l4 4v14H4z','M16 3v5h4M8 12h8M8 16h6'],
  runs:['M9 3h6M10 3v6l-6 10a1 1 0 001 2h14a1 1 0 001-2L14 9V3','M8 14h8'],
  actions:['M3 7h17l-4-4M21 17H4l4 4','M20 7l-4 4M4 17l4-4'],
  safety:['M12 2l8 3v6c0 5-8 11-8 11S4 16 4 11V5z','M8 11l3 3 5-6'],
  handoff:['M12 3v12m-4-4 4 4 4-4','M4 14v7h16v-7'],
  connections:['M9 8V5a3 3 0 016 0v3M9 16v3a3 3 0 006 0v-3','M5 9a3 3 0 000 6h14a3 3 0 000-6ZM12 9v6'],
  settings:['M4 7h16M4 17h16','M8 4v6M16 14v6'],
};
</script>
<template><svg class="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path v-for="(path,index) in paths[name]||paths.studio" :key="index" :d="path"/></svg></template>
