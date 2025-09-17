#!/usr/bin/env bash
set -euo pipefail

ruff check packages/ services/api/app services/worker/worker services/embed/app
