import asyncio
import os
from dotenv import load_dotenv
import libsql_client

load_dotenv()

async def get_db():
    """Establishes a connection to Turso (SQLite in the cloud)."""
    url = os.getenv("TURSO_DATABASE_URL")
    auth_token = os.getenv("TURSO_AUTH_TOKEN")
    
    if not url or not auth_token:
        raise ValueError("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN environment variables.")
        
    return libsql_client.create_client(url=url, auth_token=auth_token)

async def init_db():
    """Creates database tables for users and user-linked data tables async."""
    client = await get_db()

    async with client:
    # 1. Create Users Table
        await client.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # 2. Create Linked User Data Table (e.g. saving fantasy leagues to a user)
        await client.execute("""
        CREATE TABLE IF NOT EXISTS user_leagues (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            league_id TEXT NOT NULL,
            platform TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
    """)
    print("Database tables initialized successfully!")

if __name__ == "__main__":
    asyncio.run(init_db())