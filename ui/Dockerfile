FROM node:20-alpine AS base
WORKDIR /app

COPY ui/ ./
RUN npm install
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
