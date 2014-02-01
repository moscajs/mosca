# Mosca
#
# VERSION 0.0.1

FROM dockerfile/nodejs
MAINTAINER Matteo Collina <hello@matteocollina.com>

# install tools for building binary addons
RUN apt-get -y install build-essential libssl-dev curl python

ADD ./ /src

RUN cd /src; rm -rf node_modules/; npm install

RUN mkdir /db

CMD ["/usr/bin/node", "/src/bin/mosca", "-d", "/db", "--http-port", "80", "--http-bundle", "-v"]

EXPOSE 1883
EXPOSE 80
