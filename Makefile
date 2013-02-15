test:
	./node_modules/.bin/mocha --recursive test

ci:
	./node_modules/.bin/mocha --recursive --watch test

.PHONY: test
