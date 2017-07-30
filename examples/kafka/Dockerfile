FROM mhart/alpine-node:4
MAINTAINER Robert Fuller <fullergalway@gmail.com>

RUN apk update && \
    apk add make gcc g++ python git zeromq-dev krb5-dev

RUN mkdir -p /usr/src/app
RUN mkdir -p /app/db

WORKDIR /usr/src/app/

COPY ./ /usr/src/app/

RUN npm install --unsafe-perm --production
RUN npm install -g browserify uglify-js
RUN browserify -r mqtt -s mqtt | uglifyjs --screw-ie8 > public/mqtt.js

COPY examples/kafka/server.js lib/mosca_kafka_server.js
COPY examples/kafka/auth.json auth.json
COPY examples/kafka/index.html public/

EXPOSE 80
EXPOSE 1883

ENTRYPOINT ["node","lib/mosca_kafka_server.js"]
