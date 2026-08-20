FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
# tsx (used to run server.ts directly) is a devDependency, so we keep dev
# deps here rather than pruning them — this is a small server, not worth
# the extra build complexity to trim.
RUN npm ci
COPY --from=build /app/dist ./dist
COPY server.ts ./server.ts
COPY src ./src
COPY tsconfig.json ./tsconfig.json

EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
