#! /bin/sh

set -e
rm -rf docs
./node_modules/.bin/dox-foundation --source lib --target docs --title Mosca
git stash	
rm -rf /tmp/mosca-docs
cp -R docs /tmp/mosca-docs
git checkout gh-pages
git pull origin gh-pages
rm -rf docs
cp -R /tmp/mosca-docs docs
git add -A docs
git add -u
git commit -m "Updated docs" -n
git push origin
git checkout master
git stash apply
