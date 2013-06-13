test:
	./node_modules/.bin/mocha --recursive test

bail:
	./node_modules/.bin/mocha --recursive test --bail --reporter spec | ./node_modules/.bin/bunyan

ci:
	./node_modules/.bin/mocha --recursive --watch test

BEAUTIFY=./node_modules/.bin/js-beautify -r -s 2 -j
beautify:
	find lib -name "*.js" -print0 | xargs -0 $(BEAUTIFY)
	find test -name "*.js" -print0 | xargs -0 $(BEAUTIFY)

docs-clean:
	rm -rf docs

docs: docs-clean
	./node_modules/.bin/dox-foundation --source lib --target docs --title Mosca

publish-docs: docs
	git stash	
	rm -rf /tmp/mosca-docs
	cp -R docs /tmp/mosca-docs
	git checkout gh-pages
	git pull origin gh-pages
	rm -rf docs
	cp -R /tmp/mosca-docs docs
	git add docs
	git commit -m "Updated docs"
	git push origin
	git checkout master
	git stash apply

jshint:
	find lib -name "*.js" -print0 | xargs -0 ./node_modules/.bin/jshint
	find test -name "*.js" -print0 | xargs -0 ./node_modules/.bin/jshint

.PHONY: test
