FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build -w @zayqora/contracts && npm run build -w @zayqora/api
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/src/server.js"]
