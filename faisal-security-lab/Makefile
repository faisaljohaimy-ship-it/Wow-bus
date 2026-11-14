.PHONY: help init serve worker test acceptance verify install-tools clean
PY ?= python3

help:
	@echo "Faisal Security Lab — targets:"
	@echo "  make install-tools  install the real security tools (semgrep, gitleaks, osv-scanner, bandit, pip-audit)"
	@echo "  make init           initialize db, owner, catalog, tool registry"
	@echo "  make serve          run the API + UI + in-process worker (http://127.0.0.1:8787)"
	@echo "  make worker         run a standalone scan worker (separate process)"
	@echo "  make test           run the unit + integration test suite"
	@echo "  make acceptance     run the 10 release-acceptance gates and write evidence"
	@echo "  make verify         sync + print the tool registry readiness/verification"

install-tools:
	bash scripts/install-tools.sh

init:
	$(PY) -c "from app.bootstrap import init_platform; import json; print(json.dumps(init_platform(), default=str, indent=2))"

serve:
	$(PY) -m app.server

worker:
	FSL_NO_WORKER=1 $(PY) -m app.worker

test:
	$(PY) -W ignore -m unittest discover -s tests -p 'test_*.py' -v

acceptance:
	$(PY) scripts/acceptance.py

verify:
	$(PY) scripts/verify.py

clean:
	rm -rf var __pycache__ app/__pycache__ app/connectors/__pycache__ app/ai/__pycache__ tests/__pycache__
