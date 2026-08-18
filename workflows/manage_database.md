# Workflow: Manage Database

**Objective:** Deterministically run queries or inspect the BacktestBaba PostgreSQL database using the provided WAT tools.

**When to use:**
- To verify table creation, migrations, or data integrity.
- To inspect user data, test signals, or quotas.
- When you need to retrieve raw data for debugging.

## Required Tools
- `tools/db_admin.py`: A script that connects to the database using `asyncpg` and allows running specific queries or listing tables.

## Steps

1. **Verify Connection and Tables**
   Execute the tool with the `--list-tables` flag to ensure connectivity and see what tables are available:
   ```bash
   python tools/db_admin.py --list-tables
   ```

2. **Run Queries**
   If you need to query specific data (e.g., check a user's quota or signals), use the `--query` flag:
   ```bash
   python tools/db_admin.py --query "SELECT * FROM users LIMIT 5;"
   ```
   *Note: Only perform SELECT queries unless explicitly tasked to modify data (e.g., promoting a user to admin).*

3. **Handle Failures**
   - If the script fails with `asyncpg` errors, verify that `asyncpg` is installed (`pip install asyncpg`).
   - If connection fails, check the `DATABASE_URL` environment variable inside `.env` or `.env.local`.
   - In a Docker setup, verify the Postgres container is running (`docker compose ps`).
