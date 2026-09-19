<!-- Copyright (C) 2026 Synapxnet. All rights reserved. Proprietary and Confidential.
Author: maoyo | Department: 研发部 | Date: 2026-09-20 | Version: 1.0.1
Security Level: INTERNAL | Maintainer: maoyo | Email: synapxnet@gmail.com -->
# WorldOps 公网工作台契约

生产入口由 HTTPS 反向代理连接专用 `server-production.mjs`，原 `server.mjs` 仅供本机使用。

1. `/auth/login` 只向固定 MLOps 身份服务提交 `userPhone/code`，再读取真实用户身份，校验服务端用户白名单。账号令牌仅保留在服务端内存。
2. 浏览器只收到随机、HttpOnly、Secure、SameSite=Strict 会话 Cookie。会话定期重新校验，过期或撤销后重新登录。登录与所有写请求必须严格匹配配置的 Origin 和 JSON 类型。
3. `/auth/session` 返回公开的登录状态和用户显示信息，`/auth/logout` 撤销会话。未登录不能访问 `/local-info` 或任何 `/api/worldops/v1/` 资料。
4. 已授权请求只代理固定后端和固定项目。网关注入私密授权文件的项目凭据，不转发浏览器的身份头。限制方法、正文大小、并发、超时和登录频次。后端不发布公网端口。
5. `/health` 只报告进程可用。静态页面不包含令牌或项目数据。生产默认拒绝未配置白名单或无效来源。
6. Vue 外层登录门禁遇到身份服务错误保留重试，只有 `/auth/session` 明确返回 404 且浏览器为回环 HTTP 地址时才允许旧本机入口。

环境变量：`WORLDOPS_PUBLIC_ORIGIN`、`WORLDOPS_BACKEND_URL`、`WORLDOPS_ACCESS_FILE`、`WORLDOPS_PROJECT_ID`、`WORLDOPS_ALLOWED_USER_IDS`（逗号分隔、必填），可选 `WORLDOPS_WEB_PORT`。

本次仅开放现有模拟与登记能力；登录不开放真实硬件控制，也不宣称跨平台数据交付已接通。
