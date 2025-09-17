#!/usr/bin/env bash
set -euo pipefail

PYTHONPATH=services/api:packages/rag_shared pytest services/api/tests "$@"
