FROM node:18-alpine as node

FROM node as server-dev
WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci

FROM node as server-prod
WORKDIR /app
COPY package.json package-lock.json /app/
RUN npm ci --production

FROM node as server-builder
WORKDIR /app
COPY . .
COPY --from=server-dev /app/node_modules /app/node_modules
RUN npm run build

FROM node as server
WORKDIR /app
COPY --from=server-prod /app/node_modules /app/node_modules
COPY --from=server-builder /app/dist /app/dist
EXPOSE 3000
CMD [ "node", "dist/main.js" ]

# docker load -i my-node-app.tar
# docker run -p 3000:3000 -v /data:/app/data my-node-app
