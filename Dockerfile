FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json eslint.config.js .prettierrc.json ./
COPY src ./src

RUN npm run build

CMD ["node", "dist/index.js", "--run-once"]
