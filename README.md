<!-- Copyright (C) 2026 Synapxnet. All rights reserved. Proprietary and Confidential.
Author: maoyo | Department: 研发部 | Date: 2026-09-20 | Version: 1.0.1
Security Level: INTERNAL | Maintainer: maoyo | Email: synapxnet@gmail.com -->
# XnetWorldOps Web

SynapXnet 物理世界工作台前端，包含空间实验台、设备与场地、观测、仿真评估、动作回执、安全资料、数据候选和皮肤配置。

## 开发与验证

要求 Node.js 22 或更新版本。

```sh
npm ci
npm test
npm run build
```

`npm start` 是仅绑定 `127.0.0.1` 的旧本机网关，搭配 WorldOps 后端本机启动流程使用。

## 生产部署

使用 `Dockerfile` 构建生产镜像，或构建后运行 `npm run start:production`。生产服务监听 `0.0.0.0:5318`，只通过私有容器网络交给 HTTPS 反向代理，不直接发布此端口。

| 环境变量 | 值或说明 |
| --- | --- |
| `WORLDOPS_PUBLIC_ORIGIN` | `https://goai.xnetworldops.synapxnet.online`，必须 HTTPS |
| `WORLDOPS_BACKEND_URL` | `http://worldops-api:5317/`，固定私有目标 |
| `WORLDOPS_ACCESS_FILE` | `/secrets/access.local.json`，只读挂载，与后端同一授权文件 |
| `WORLDOPS_PROJECT_ID` | `local-world` 或受控项目标识 |
| `WORLDOPS_ALLOWED_USER_IDS` | 明确授权的 MLOps 用户 ID，逗号分隔；没有默认值 |
| `WORLDOPS_WEB_PORT` | 可选，默认 `5318` |

授权文件由后端初始化流程生成，格式含 `grants: [{projectId, token}]` 与 `cursorSecret`。不得提交、烘焙入镜像或放在静态目录；不得在仓库保存 TLS 私钥或账号密码。

固定的 MLOps 登录服务核验账号后，网关再次读取 `/api/user/info` 并检查白名单。浏览器只持有安全会话 Cookie，上游账号令牌仅存服务端内存。会话 30 分钟到期，期间每 5 分钟重新验证上游身份。进程重启后重新登录。登录尝试限制为每实例每 5 分钟 20 次，共享反向代理出口不会绕过限制。

生产前置代理必须保持原始 Host 和 Origin，不缓存 `/auth/*`、`/local-info`、`/api/*`。健康检查使用 `/health` 并设置与 `WORLDOPS_PUBLIC_ORIGIN` 相同的 Host。后端仅在私有网络监听；浏览器 Authorization、X-Project-Id 均不会被转发。

## 当前边界

当前支持仿真和资料管理，真实设备控制未启用；数据候选尚不等于发布到 DataOps。身份共享也不表示跨平台数据交付自动接通。源代码公开供评审与查看，权利以仓库授权说明为准。

详细认证接口与边界见 [PRODUCTION-DESIGN.md](./PRODUCTION-DESIGN.md)。
