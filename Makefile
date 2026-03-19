SHELL := /bin/bash
ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

.PHONY: help install dev build quality

help:
	@echo "  make install  - npm install"
	@echo "  make dev     - Run dev server (port 3001)"
	@echo "  make build   - Production build"
	@echo "  make quality - Lint, typecheck, unit tests"

install:
	@cd "$(ROOT_DIR)" && npm install

dev:
	@cd "$(ROOT_DIR)" && npm run dev

build:
	@cd "$(ROOT_DIR)" && npm run build

quality:
	@cd "$(ROOT_DIR)" && npm run quality:ci
