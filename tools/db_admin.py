import asyncio
import os
import sys
import argparse

sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

try:
    import asyncpg
except ImportError:
    print("Error: asyncpg is required. Run 'pip install asyncpg' inside the backend virtual environment.")
    sys.exit(1)

from backend.config import settings

async def list_tables(conn):
    rows = await conn.fetch('''
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
    ''')
    print("--- Public Tables ---")
    for row in rows:
        print(f"- {row['table_name']}")

async def run_query(conn, query):
    try:
        if query.strip().upper().startswith('SELECT'):
            rows = await conn.fetch(query)
            print(f"--- Query Results ({len(rows)} rows) ---")
            for row in rows:
                print(dict(row))
        else:
            result = await conn.execute(query)
            print(f"--- Execution Result ---")
            print(result)
    except Exception as e:
        print(f"Error executing query: {e}")

async def main():
    parser = argparse.ArgumentParser(description="Deterministic database admin tool for WAT framework")
    parser.add_argument("--list-tables", action="store_true", help="List all tables in the public schema")
    parser.add_argument("--query", type=str, help="Execute a specific SQL query")
    args = parser.parse_args()

    db_url = settings.DATABASE_URL
    if not db_url:
        print("Error: DATABASE_URL not found in environment.")
        sys.exit(1)

    try:
        conn = await asyncpg.connect(db_url)
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        sys.exit(1)

    try:
        if args.list_tables:
            await list_tables(conn)
        
        if args.query:
            await run_query(conn, args.query)
            
        if not args.list_tables and not args.query:
            parser.print_help()
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
