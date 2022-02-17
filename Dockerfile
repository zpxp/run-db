FROM node:16


WORKDIR /app

ARG DB
ENV DB=/volume/run.db
VOLUME [ "/volume" ]

COPY package*.json ./
RUN npm install


COPY . .
EXPOSE 8000
CMD [ "sh", "start.sh" ]
