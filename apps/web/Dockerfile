FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/web apps/web
ARG API_PROXY_URL=http://api:4000
ENV API_PROXY_URL=$API_PROXY_URL
RUN npm run build -w @zayqora/contracts && npm run build -w @zayqora/web
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm","run","start","-w","@zayqora/web"]
