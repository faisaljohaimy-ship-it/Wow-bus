.PHONY: help init serve worker test acceptance acceptance-evidence verify install-tools clean
PY ?= python3

help:
	@echo "Faisal Security Lab — targets:"
	@echo "  make install-tools        install the security tools at pinned versions (semgrep, gitleaks, osv-scanner, bandit, pip-audit); needs root, or see: bash scripts/install-tools.sh --help"
	@echo "  make init                 initialize db, owner, catalog, tool registry"
	@echo "  make serve                run the API + UI + in-process worker (http://127.0.0.1:8787)"
	@echo "  make worker               run a standalone scan worker (separate process)"
	@echo "  make test                 run the unit + integration test suite"
	@echo "  make acceptance           run the 10 release-acceptance gates; the report goes to var/acceptance-report.json (not tracked)"
	@echo "  make acceptance-evidence  the same, and also rewrite the tracked copy evidence/acceptance-report.json"
	@echo "  make verify               sync + print the tool registry readiness/verification (creates no account)"

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

acceptance-evidence:
	$(PY) scripts/acceptance.py --evidence

verify:
	$(PY) scripts/verify.py

clean:
	rm -rf var __pycache__ app/__pycache__ app/connectors/__pycache__ app/ai/__pycache__ tests/__pycache__
