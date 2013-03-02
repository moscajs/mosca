test:
	./node_modules/.bin/mocha --recursive test --reporter nyan

bail:
	./node_modules/.bin/mocha --recursive test --bail --reporter spec

ci:
	./node_modules/.bin/mocha --recursive --watch test

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

.PHONY: test
