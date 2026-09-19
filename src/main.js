/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：挂载物理世界工作台。Purpose: Mount the world workbench.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.1 | Security Level: INTERNAL
__version__: 1.0.1 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
import { createApp } from 'vue';
import App from './LoginGate.vue';
import './style.css';
import './management.css';
import './workspace.css';
createApp(App).mount('#app');
