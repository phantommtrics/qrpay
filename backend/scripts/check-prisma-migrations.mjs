/**
 * Fails if any prisma/migrations/* folder is missing migration.sql.
 * Prevents Prisma P3015 ("Could not find the migration file at migration.sql").
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations')

const entries = fs.readdirSync(migrationsDir, { withFileTypes: true })
const bad = []

for (const e of entries) {
  if (!e.isDirectory()) continue
  const sql = path.join(migrationsDir, e.name, 'migration.sql')
  if (!fs.existsSync(sql)) {
    bad.push(e.name)
  }
}

if (bad.length > 0) {
  console.error(
    'Prisma migration folders must contain migration.sql (fix P3015). Missing file in:\n  ' +
      bad.join('\n  '),
  )
  process.exit(1)
}
