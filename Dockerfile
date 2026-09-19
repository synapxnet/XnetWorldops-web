# Copyright (C) 2026 Synapxnet. All rights reserved.
# Proprietary and Confidential. Authorized distribution only.
# Author: maoyo | Department: 研发部 | Date: 2026-09-20 | Version: 1.0.1
# Security Level: INTERNAL | Maintainer: maoyo | Email: synapxnet@gmail.com
FROM node:22-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY server-production.mjs ./
USER node
EXPOSE 5318
CMD ["node", "server-production.mjs"]
