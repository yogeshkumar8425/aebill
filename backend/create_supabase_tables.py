from pathlib import Path
import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def load_env(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    load_env(Path(__file__).with_name(".env"))

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing from backend/.env")
    database_url = normalize_database_url(database_url)

    schema_path = Path(__file__).resolve().parent.parent / "supabase-schema.sql"
    if not schema_path.exists():
        raise RuntimeError(f"Schema file not found: {schema_path}")

    import psycopg

    schema_sql = schema_path.read_text(encoding="utf-8")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(schema_sql)
        connection.commit()

    print("Supabase schema applied successfully.")


def normalize_database_url(database_url: str) -> str:
    parts = urlsplit(database_url)
    query_pairs = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if key.lower() != "pgbouncer"
    ]

    if not any(key.lower() == "sslmode" for key, _ in query_pairs):
        query_pairs.append(("sslmode", "require"))

    return urlunsplit((
        parts.scheme,
        parts.netloc,
        parts.path,
        urlencode(query_pairs),
        parts.fragment
    ))


if __name__ == "__main__":
    main()
