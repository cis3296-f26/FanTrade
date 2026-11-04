import asyncio
import os

from dotenv import load_dotenv
import libsql_client

# Automatically load variables from the local .env file
load_dotenv()


async def get_db():
    """Establish an async connection to Turso (SQLite in the cloud)."""
    url = (os.getenv("TURSO_DATABASE_URL") or "").strip().strip('"').strip("'")
    auth_token = (os.getenv("TURSO_AUTH_TOKEN") or "").strip().strip('"').strip("'")

    if not url or not auth_token:
        raise ValueError(
            "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables."
        )

    # Turso Python client requires https:// instead of websocket libsql://
    if url.startswith("libsql://"):
        url = "https://" + url[len("libsql://"):]

    return libsql_client.create_client(url=url, auth_token=auth_token)


async def _table_columns(client, table_name):
    result = await client.execute(f"PRAGMA table_info({table_name})")
    return {row[1]: row for row in result.rows}


async def _table_exists(client, table_name):
    result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        [table_name],
    )
    return bool(result.rows)


async def _create_users_table(client, table_name="users"):
    await client.execute(f"""
        CREATE TABLE {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE,
            password_hash TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)


async def _create_user_leagues_table(client, table_name="user_leagues", users_table="users"):
    await client.execute(f"""
        CREATE TABLE {table_name} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            league_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            league_name TEXT,
            FOREIGN KEY (user_id) REFERENCES {users_table}(id) ON DELETE CASCADE,
            UNIQUE (user_id, league_id, platform)
        )
    """)


async def _migrate_user_tables(client, users_columns, has_user_leagues):
    """Add password-based accounts while preserving existing user and league rows."""
    email_is_required = "email" in users_columns and users_columns["email"][3] == 1
    needs_user_migration = (
        "password_hash" not in users_columns
        or "email" not in users_columns
        or email_is_required
    )

    if not needs_user_migration:
        if not has_user_leagues:
            await _create_user_leagues_table(client)
            return

        league_columns = await _table_columns(client, "user_leagues")
        if "league_name" not in league_columns:
            await client.execute("ALTER TABLE user_leagues ADD COLUMN league_name TEXT")
        await client.execute("""
            DELETE FROM user_leagues
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM user_leagues
                GROUP BY user_id, league_id, platform
            )
        """)
        await client.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS user_leagues_user_league_unique
            ON user_leagues(user_id, league_id, platform)
        """)
        return

    email_expr = "email" if "email" in users_columns else "NULL"
    password_expr = "password_hash" if "password_hash" in users_columns else "NULL"
    created_expr = "created_at" if "created_at" in users_columns else "CURRENT_TIMESTAMP"
    old_users = await client.execute(
        f"SELECT id, username, {email_expr}, {password_expr}, {created_expr} FROM users"
    )

    old_leagues = []
    if has_user_leagues:
        league_columns = await _table_columns(client, "user_leagues")
        league_name_expr = "league_name" if "league_name" in league_columns else "NULL"
        old_leagues = (
            await client.execute(
                f"SELECT id, user_id, league_id, platform, {league_name_expr} "
                "FROM user_leagues"
            )
        ).rows

    await client.execute("DROP TABLE IF EXISTS user_leagues_migration")
    await client.execute("DROP TABLE IF EXISTS users_migration")
    await _create_users_table(client, "users_migration")

    for row in old_users.rows:
        await client.execute(
            """
            INSERT INTO users_migration (id, username, email, password_hash, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            list(row),
        )

    await _create_user_leagues_table(
        client, "user_leagues_migration", "users_migration"
    )
    for row in old_leagues:
        await client.execute(
            """
            INSERT OR IGNORE INTO user_leagues_migration
                (id, user_id, league_id, platform, league_name)
            VALUES (?, ?, ?, ?, ?)
            """,
            list(row),
        )

    if has_user_leagues:
        await client.execute("DROP TABLE user_leagues")
    await client.execute("DROP TABLE users")
    await client.execute("ALTER TABLE users_migration RENAME TO users")
    await client.execute(
        "ALTER TABLE user_leagues_migration RENAME TO user_leagues"
    )


async def init_db():
    """Create or migrate the account and saved-league tables."""
    client = await get_db()

    async with client:
        users_exist = await _table_exists(client, "users")
        if not users_exist:
            await _create_users_table(client)

        users_columns = await _table_columns(client, "users")
        has_user_leagues = await _table_exists(client, "user_leagues")
        await _migrate_user_tables(client, users_columns, has_user_leagues)

    print("Database tables initialized successfully!")


if __name__ == "__main__":
    asyncio.run(init_db())