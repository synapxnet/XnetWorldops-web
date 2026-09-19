<!--
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：渲染仿真关键帧。Purpose: Render simulation keyframes.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
-->
<script setup>
import {onMounted,onBeforeUnmount,ref,watch} from 'vue';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {renderPosition,environmentGeometry} from './model.js';
const props=defineProps({frame:Object,dark:Boolean,environment:Object});
const host=ref(null),renderError=ref('');
let renderer,scene,camera,controls,observer,animation,left,right,target,table,zone;
const disposable=[];
/** 创建可回收材质几何体，统一阴影。 Create disposable geometry with consistent shadows. */
function mesh(geometry,color,opacity=1) {
  const material=new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.12,transparent:opacity<1,opacity});
  disposable.push(geometry,material);
  const object=new THREE.Mesh(geometry,material);object.castShadow=true;object.receiveShadow=true;return object;
}
/** 构建末端夹爪示意，避免伪造完整机械臂姿态。 Build an end-effector glyph without inventing full-arm poses. */
function gripper(color) {
  const group=new THREE.Group();
  const palm=mesh(new THREE.BoxGeometry(.09,.035,.07),color);group.add(palm);
  for(const sign of [-1,1]) {const finger=mesh(new THREE.BoxGeometry(.018,.07,.018),color);finger.position.set(sign*.045,-.04,0);group.add(finger);}
  scene.add(group);return group;
}
/** 将真实关键帧位置放入场景，缺坐标时隐藏对象。 Apply recorded positions and hide objects with missing coordinates. */
function position(object,value) {const point=renderPosition(value);object.visible=Boolean(point);if(point)object.position.set(...point);}
/** 刷新当前记录，不插值制造不存在的物理轨迹。 Refresh the recorded keyframe without inventing physical interpolation. */
function updateFrame() {
  if(!scene)return;
  position(left,props.frame?.leftPositionM);position(right,props.frame?.rightPositionM);position(target,props.frame?.targetPositionM);
  for(const [object,closed] of [[left,props.frame?.leftGripperClosed],[right,props.frame?.rightGripperClosed]]) {
    object.children[1].position.x=closed===true ? -.023 : -.045;object.children[2].position.x=closed===true ? .023 : .045;
  }
}
/** 同步明暗画布与雾色，保持对象对比度。 Synchronize canvas and fog colors with the theme. */
function updateTheme() {if(!scene)return;const color=props.dark?0x172434:0xdce5ed;scene.background=new THREE.Color(color);scene.fog=new THREE.Fog(color,6,14);}
/** 按当前源环境设置桌面和区域，无版本资料时隐藏几何。 Apply source table and zone geometry, hiding them when the version is unavailable. */
function updateEnvironment(){if(!table||!zone)return;const geometry=environmentGeometry(props.environment);table.visible=zone.visible=Boolean(geometry);if(!geometry)return;table.position.set(...geometry.tablePosition);table.scale.set(...geometry.tableSize);zone.position.set(...geometry.zonePosition);zone.scale.set(geometry.zoneRadius,.002,geometry.zoneRadius);}
/** 恢复可理解的桌面观察角度。 Restore the default tabletop view. */
function resetView() {if(!camera)return;const center=environmentGeometry(props.environment)?.tablePosition||[0,.7,0];camera.position.set(center[0]+1.65,center[1]+1.05,center[2]+1.85);controls.target.set(...center);controls.update();}
defineExpose({resetView});
/** 按实际容器大小更新画布。 Resize rendering to the actual container. */
function resize() {if(!renderer||!host.value)return;const {width,height}=host.value.getBoundingClientRect();camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();renderer.setSize(width,height,false);}
/** 只渲染观察视角，不推进物理仿真。 Render view controls without advancing physics. */
function animate() {animation=requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}
/** 初始化WebGL场景与基本坐标参考。 Initialize WebGL and coordinate references. */
function initialize() {
  try {
    renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.value.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('aria-label','仿真关键帧三维视图，可拖动旋转、滚轮缩放');
    scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(40,1,.01,30);controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=.35;controls.maxDistance=5;controls.maxPolarAngle=Math.PI*.49;
    scene.add(new THREE.HemisphereLight(0xffffff,0x536a82,1.65));const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(2,4,2);light.castShadow=true;light.shadow.mapSize.set(1024,1024);scene.add(light);disposable.push(light.shadow);
    table=mesh(new THREE.BoxGeometry(1,1,1),0x8397ab);scene.add(table);
    const floor=mesh(new THREE.PlaneGeometry(30,30),0x9cabc0,.18);floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
    const grid=new THREE.GridHelper(6,36,0x547695,0x9bb0c3);grid.position.y=-.01;scene.add(grid);disposable.push(grid.geometry,grid.material);
    zone=mesh(new THREE.CylinderGeometry(1,1,1,48),0x2b8eee,.45);scene.add(zone);
    left=gripper(0x1b8bcc);right=gripper(0x7776d7);target=mesh(new THREE.BoxGeometry(.05,.05,.05),0xf4aa57);scene.add(target);
    updateTheme();updateEnvironment();updateFrame();resetView();resize();observer=new ResizeObserver(resize);observer.observe(host.value);animate();
  } catch {renderError.value='当前图形环境无法显示三维场景，仍可查看下方记录与结果。';}
}
/** 释放画布、事件与GPU资源。 Release canvas listeners and GPU resources. */
function dispose() {cancelAnimationFrame(animation);observer?.disconnect();controls?.dispose();for(const item of disposable){if(Array.isArray(item))item.forEach(disposeMaterial);else item.dispose?.();}renderer?.dispose();renderer?.domElement.remove();}
/** 释放网格引用的材质。 Dispose a material referenced by a grid. */
function disposeMaterial(material){material.dispose();}
/** 读取待监听的关键帧。 Read the watched keyframe. */
function frameSource(){return props.frame;}
/** 读取待监听的主题。 Read the watched theme. */
function themeSource(){return props.dark;}
/** 读取待监听的环境版本。 Read the watched environment version. */
function environmentSource(){return props.environment;}
onMounted(initialize);onBeforeUnmount(dispose);watch(frameSource,updateFrame);watch(themeSource,updateTheme);watch(environmentSource,updateEnvironment);
</script>
<template><div ref="host" class="scene-canvas"><p v-if="renderError" class="scene-render-error" role="status">{{renderError}}</p></div></template>
