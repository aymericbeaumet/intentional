.PHONY: check install browsers build lint typecheck test test-browser live site new-site capture format clean

check: lint typecheck test test-browser

install:
	npm ci

browsers:
	npm run browsers

build:
	npm run build

lint:
	npm run lint

typecheck:
	npm run typecheck

test:
	npm test

test-browser:
	npm run test:browser

live:
	npm run test:live

site: build
	npm run site

new-site:
	npm run new-site -- $(SITE)

capture:
	npm run capture -- $(SITE) $(URL)

format:
	npm run format

clean:
	rm -rf dist coverage
