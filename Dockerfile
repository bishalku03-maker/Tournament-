FROM node:20-slim

WORKDIR /usr/src/app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY src ./src
COPY .env.example .env.example

ENV DATABASE_PATH=./database.sqlite

CMD ["npm", "start"]
