"""Generate local credentials once; never replace an existing configuration."""
import secrets
from pathlib import Path
root = Path(__file__).resolve().parents[1]
path = root / ".env"
try:
    with path.open("x") as stream:
        stream.write("POSTGRES_PASSWORD=" + secrets.token_hex(24) + "\n")
        stream.write("RECIPE_TRACKER_AUTH_SECRET=" + secrets.token_hex(32) + "\n")
        stream.write("RECIPE_TRACKER_USERS=demo:" + str(secrets.randbelow(90000000) + 10000000) + "\n")
    path.chmod(0o600)
except FileExistsError:
    pass
print("Local configuration is ready. The demo login is in .env.")
