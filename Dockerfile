FROM node:16

RUN apt-get update -y && apt-get install -y python make g++


WORKDIR /app

COPY package*.json ./
RUN npm install

ARG DB
ENV DB=/volume/run.db
ENV PORT=8000
VOLUME [ "/volume" ]
EXPOSE 8000

COPY . .

CMD [ "sh", "start.sh" ]
