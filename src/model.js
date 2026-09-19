/*
Copyright (C) 2026 Synapxnet. All rights reserved.
This file is Synapxnet Proprietary and Confidential. It is strictly
forbidden to copy, distribute, or use without explicit authorization.
用途：响应边界与关键帧时间计算。Purpose: Response boundaries and keyframe time calculations.
Author: maoyo | Department: 研发部 | Date: 2026-09-13
Version: 1.0.0 | Security Level: INTERNAL
__version__: 1.0.0 | __author__: maoyo | __copyright__: Copyright 2026 Synapxnet
__maintainer__: maoyo | __email__: synapxnet@gmail.com
*/
/** 验证来源和项目，拒绝错范围数据。 Validate source and project before accepting data. */
export function unwrap(body, projectId) {
  if(body?.code !== 0) throw new Error(body?.message || '资料暂时无法取得');
  const meta=body.meta;
  if(meta?.schemaVersion !== '1.0.0' || meta.sourcePlatform !== 'worldops' || meta.sourceOrigin !== 'native' || meta.scope?.projectId !== projectId) throw new Error('资料来源或项目不匹配，请重新连接');
  return body.data;
}
/** 使用整数纳秒求相对秒数，避免大时间戳精度损失。 Subtract integer nanoseconds before converting relative time. */
export function relativeSeconds(current, first) {
  if(!/^\d+$/.test(String(current)) || !/^\d+$/.test(String(first))) return null;
  const delta=BigInt(current)-BigInt(first);
  if(delta < 0n || delta > 86400000000000n) return null;
  return Number(delta)/1e9;
}
/** 只接受有限三维坐标，不用零补缺失位置。 Accept finite 3D positions without zero-filling missing values. */
export function validPosition(position) {
  return Array.isArray(position) && position.length===3 && position.every(Number.isFinite);
}
/** 将源Z朝上右手坐标转换为渲染Y朝上坐标。 Convert source Z-up right-handed coordinates to rendering Y-up. */
export function renderPosition(position) {
  return validPosition(position) ? [position[0],position[2],-position[1]] : null;
}
/** 为重试保留请求和参数，终态后才允许下一次实验。 Retain request identity and input until the run reaches a terminal state. */
export function operationKey(previous, input, createId) {
  const digest=JSON.stringify(input);
  return previous || {digest,key:createId(),input:JSON.parse(digest)};
}
/** 只在有明确终态时结束重试身份。 Release a retry identity only after an explicit terminal state. */
export function settledRun(status){return ['succeeded','failed','interrupted'].includes(status);}
/** 在建立运行身份前验证参数，避免无效输入锁住重试。 Validate inputs before creating a run identity so invalid input remains editable. */
export function simulationInput(environmentId,seed,reference){
  if(String(seed).trim()===''||!Number.isInteger(Number(seed))||Number(seed)<0||Number(seed)>2147483647)throw new Error('随机种子需为 0 至 2147483647 的整数');
  const input={environmentId,seed:Number(seed)};const value=String(reference||'').trim();
  if(value && (value.length>128||!/^[A-Za-z0-9._:-]+$/.test(value)))throw new Error('运行标识仅支持英文字母、数字、点、下划线、冒号和连字符');
  if(value)input.openxnetRunId=value;return input;
}
/** 明确拒绝且未执行的请求可修改参数，未知结果继续保留身份。 Allow edits for definitely rejected requests and retain identity for uncertain outcomes. */
export function rejectedBeforeExecution(status){return [400,401,403,404,413,422].includes(status);}
/** 回放只匹配原环境版本，不能把旧轨迹套在新场景。 Match playback to its original environment version. */
export function playbackEnvironment(environments, selectedId, episode){
  for(const item of environments){if(episode ? item.id===episode.environmentId && item.resourceVersion===episode.environmentVersion : item.id===selectedId)return item;}
  return null;
}
/** 验证源几何后转为渲染坐标，不用示例值掩盖缺失。 Validate source geometry and convert it without fallback fixtures. */
export function environmentGeometry(environment){
  const source=environment?.scene;
  if(source?.upAxis!=='z'||source.coordinateSystem!=='right-handed'||source.unit!=='m')return null;
  const table=source.table,zone=source.placementZone;
  if(!validPosition(table?.positionM)||!validPosition(table?.halfSizeM)||table.halfSizeM.some(nonPositive)||!validPosition(zone?.positionM)||!Number.isFinite(zone?.radiusM)||zone.radiusM<=0)return null;
  return {tablePosition:renderPosition(table.positionM),tableSize:[table.halfSizeM[0]*2,table.halfSizeM[2]*2,table.halfSizeM[1]*2],zonePosition:renderPosition(zone.positionM),zoneRadius:zone.radiusM};
}
/** 检查尺寸必须大于零。 Require strictly positive dimensions. */
function nonPositive(value){return value<=0;}
/** 使用精确技能标识，避免把抓取验证误译为抓取。 Translate exact skill identities without confusing grasp verification and grasp. */
export function phase(value){return {initial_state:'初始观测',observe_scene:'环境观测',reach_pregrasp:'接近抓取点',verify_grasp:'核验抓取',move_to_handover:'移动至交接点',receive_object:'接取物体',release_object:'释放物体',place_object:'放置物体'}[value]||value||'初始观测';}
