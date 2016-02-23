# Mosca
#
# VERSION 0.2.1

FROM mhart/alpine-node:4
MAINTAINER Matteo Collina <hello@matteocollina.com>

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app/

COPY ./ /usr/src/app/

RUN apk update && \
    apk add make gcc g++ python git && \
    npm install --unsafe-perm --production && \
    apk del make gcc g++ python git

EXPOSE 80
EXPOSE 1883

ENTRYPOINT ["/usr/src/app/bin/mosca", "-d", "/db", "--http-port", "80", "--http-bundle", "-v"]
