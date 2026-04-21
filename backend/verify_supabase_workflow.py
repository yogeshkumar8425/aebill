from pathlib import Path
import os

import psycopg


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
    database_url = os.environ["DATABASE_URL"].replace("pgbouncer=true", "sslmode=require")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select table_name
                from information_schema.tables
                where table_schema = 'public'
                  and table_name in ('profiles', 'user_counters', 'items', 'invoices')
                order by table_name
                """
            )
            tables = [row[0] for row in cursor.fetchall()]

            cursor.execute(
                """
                select column_name
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'profiles'
                order by ordinal_position
                """
            )
            profile_columns = [row[0] for row in cursor.fetchall()]

            cursor.execute(
                """
                select tablename, rowsecurity
                from pg_tables
                where schemaname = 'public'
                  and tablename in ('profiles', 'user_counters', 'items', 'invoices')
                order by tablename
                """
            )
            rls_rows = cursor.fetchall()

    print("tables:", ", ".join(tables))
    print("profile_columns:", ", ".join(profile_columns))
    print("rls:", ", ".join(f"{name}={enabled}" for name, enabled in rls_rows))


if __name__ == "__main__":
    main()
