# Dockerfile
FROM node:20-alpine

WORKDIR /usr/src/app

COPY package*.json ./
COPY event-hub/package*.json ./event-hub/

RUN npm install --legacy-peer-deps

COPY . .

RUN npm run build

ENV DB_PATH=/data/events.db
ENV API_KEY_DEPLOY=10ad2f55d8s4s91d5614f8
ENV PORT_DEPLOY=3000
ENV HOST_DEPLOY=in815-scrapers.demo.audent.io
ENV NAME_DEPLOY=

EXPOSE 3000

CMD ["npm", "run", "start"]
