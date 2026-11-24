"""Validate the DB binding selected by the Worker deployment workflow."""

import argparse
from pathlib import Path
import tomllib
from uuid import UUID


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("environment", choices=("staging", "production"))
environment = parser.parse_args().environment
config = tomllib.loads(Path("apps/worker/wrangler.toml").read_text(encoding="utf-8"))
databases = config.get("env", {}).get(environment, {}).get("d1_databases", [])
ids = [db.get("database_id") for db in databases if db.get("binding") == "DB"]
if len(ids) != 1 or not isinstance(ids[0], str):
    raise SystemExit(f"Configure exactly one {environment} D1 binding named DB.")

try:
    database_id = UUID(ids[0])
except ValueError:
    raise SystemExit(f"Configure a valid {environment} D1 database UUID.") from None

if database_id.hex in {"0" * 32, "1" * 32}:
    raise SystemExit(f"Replace the {environment} D1 database placeholder before deployment.")
