# Mosca
#
# VERSION 0.0.3

FROM dockerfile/nodejs
MAINTAINER Matteo Collina <hello@matteocollina.com>

# install tools for building binary addons
RUN apt-get -y install build-essential libssl-dev curl python

RUN mkdir /db

ADD ./ /src

RUN cd /src; rm -rf node_modules/; npm install --unsafe-perm

EXPOSE 80
EXPOSE 1883

ENTRYPOINT ["/src/bin/mosca", "-d", "/db", "--http-port", "80", "--http-bundle", "-v"]
