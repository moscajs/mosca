# Mosca
#
# VERSION 2.5.2

FROM ma314smith/rpi2-node-qemu:4
MAINTAINER Matteo Collina <hello@matteocollina.com>

RUN [ "cross-build-start" ]

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app/

COPY ./ /usr/src/app/

RUN apt-get update && \
    apt-get install make gcc g++ python git libzmq3-dev libkrb5-dev && \
    npm install --unsafe-perm --production && \
    apt-get remove make gcc g++ python git && \
    apt-get autoremove

EXPOSE 80
EXPOSE 1883

ENTRYPOINT ["/usr/src/app/bin/mosca", "-d", "/db", "--http-port", "80", "--http-bundle", "-v"]

RUN [ "cross-build-end" ]
