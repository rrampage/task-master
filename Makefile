# Makefile for running a local dev server with Python's http.server

PORT ?= 8000
DIR ?= .

serve:
	@echo "Starting dev server at http://localhost:$(PORT)"
	@python -m http.server $(PORT) --directory $(DIR)

.PHONY: serve
