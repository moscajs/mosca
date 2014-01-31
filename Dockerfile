FROM dockerfile/nodejs

ADD ./ /src

CMD cd src; npm install

CMD ["/usr/bin/node", "/src/bin/mosca", "-v"]

EXPOSE  1883
