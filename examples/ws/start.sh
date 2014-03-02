#! /bin/sh

basedir=`dirname $0`
mosca=$basedir/../../bin/mosca
bunyan=$basedir/../../node_modules/.bin/bunyan

$mosca --http-port 3000 --http-static $basedir --http-bundle \
        --verbose | $bunyan

