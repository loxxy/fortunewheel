const path = require('path')
const Database = require('better-sqlite3')

const DB_PATH = path.join(__dirname, 'data', 'wheel.db')
const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function ensureGameScheduleColumns() {
  const columns = db.prepare('PRAGMA table_info(games)').all()
  const hasScheduleType = columns.some((column) => column.name === 'schedule_type')
  const hasSchedulePayload = columns.some((column) => column.name === 'schedule_payload')
  const hasAllowRepeat = columns.some((column) => column.name === 'allow_repeat_winners')
  const hasGifts = columns.some((column) => column.name === 'gifts')
  if (!hasScheduleType) {
    db.prepare("ALTER TABLE games ADD COLUMN schedule_type TEXT DEFAULT 'repeat'").run()
  }
  if (!hasSchedulePayload) {
    db.prepare('ALTER TABLE games ADD COLUMN schedule_payload TEXT').run()
  }
  if (!hasAllowRepeat) {
    db.prepare('ALTER TABLE games ADD COLUMN allow_repeat_winners INTEGER DEFAULT 0').run()
  }
  if (!hasGifts) {
    db.prepare('ALTER TABLE games ADD COLUMN gifts TEXT DEFAULT ""').run()
  }
  db.prepare("UPDATE games SET schedule_type = COALESCE(schedule_type, 'repeat')").run()
}

function ensureWinnerSnapshots() {
  const columns = db.prepare('PRAGMA table_info(winners)').all()
  const columnNames = columns.map((column) => column.name)
  const hasSnapshotColumns = columnNames.includes('employee_first_name')
  const employeeIdColumn = columns.find((column) => column.name === 'employee_id')
  const employeeIdNotNull = employeeIdColumn ? employeeIdColumn.notnull === 1 : false
  if (hasSnapshotColumns && !employeeIdNotNull) {
    return
  }
  const migrate = db.transaction(() => {
    db.prepare('DROP TABLE IF EXISTS winners_tmp').run()
    db.prepare(`
      CREATE TABLE winners_tmp (
        id TEXT PRIMARY KEY,
        game_slug TEXT NOT NULL,
        employee_id INTEGER,
        employee_first_name TEXT NOT NULL,
        employee_last_name TEXT DEFAULT '',
        employee_avatar TEXT DEFAULT '',
        drawn_at TEXT NOT NULL,
        trigger TEXT NOT NULL,
        FOREIGN KEY (game_slug) REFERENCES games(slug) ON DELETE CASCADE,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
      )
    `).run()
    if (hasSnapshotColumns) {
      db.prepare(`
        INSERT INTO winners_tmp (id, game_slug, employee_id, employee_first_name, employee_last_name, employee_avatar, drawn_at, trigger)
        SELECT id, game_slug, employee_id, employee_first_name, employee_last_name, employee_avatar, drawn_at, trigger
        FROM winners
      `).run()
    } else {
      db.prepare(`
        INSERT INTO winners_tmp (id, game_slug, employee_id, employee_first_name, employee_last_name, employee_avatar, drawn_at, trigger)
        SELECT w.id,
               w.game_slug,
               w.employee_id,
               COALESCE(e.first_name, 'Former Employee'),
               COALESCE(e.last_name, ''),
               COALESCE(e.avatar, ''),
               w.drawn_at,
               w.trigger
        FROM winners w
        LEFT JOIN employees e ON e.id = w.employee_id
      `).run()
    }
    db.prepare('DROP TABLE winners').run()
    db.prepare('ALTER TABLE winners_tmp RENAME TO winners').run()
  })
  migrate()
}

db.prepare(`
  CREATE TABLE IF NOT EXISTS games (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cron TEXT NOT NULL,
    timezone TEXT NOT NULL,
    allow_repeat_winners INTEGER DEFAULT 0,
    gifts TEXT DEFAULT '',
    schedule_type TEXT DEFAULT 'repeat',
    schedule_payload TEXT,
    created_at TEXT NOT NULL
  )
`).run()

ensureGameScheduleColumns()
db.prepare('UPDATE games SET name = slug WHERE name != slug').run()

const shapeGame = (row) =>
  row
    ? {
        slug: row.slug,
        name: row.slug,
        cron: row.cron,
        timezone: row.timezone,
        allowRepeatWinners: row.allowRepeatWinners === 1,
        gifts: row.gifts || '',
        scheduleType: row.scheduleType,
        schedulePayload: row.schedulePayload,
        createdAt: row.createdAt,
      }
    : null

db.prepare(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_slug TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT DEFAULT '',
    role TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (game_slug) REFERENCES games(slug) ON DELETE CASCADE
  )
`).run()

db.prepare(`
  CREATE TABLE IF NOT EXISTS winners (
    id TEXT PRIMARY KEY,
    game_slug TEXT NOT NULL,
    employee_id INTEGER,
    employee_first_name TEXT NOT NULL,
    employee_last_name TEXT DEFAULT '',
    employee_avatar TEXT DEFAULT '',
    drawn_at TEXT NOT NULL,
    trigger TEXT NOT NULL,
    FOREIGN KEY (game_slug) REFERENCES games(slug) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
  )
`).run()

ensureWinnerSnapshots()

const WINNER_BASE_SELECT = `
  id,
  game_slug AS gameSlug,
  employee_id AS employeeId,
  employee_first_name AS employeeFirstName,
  employee_last_name AS employeeLastName,
  employee_avatar AS employeeAvatar,
  drawn_at AS drawnAt,
  trigger
`

const shapeWinner = (row) =>
  row
    ? {
        id: row.id,
        drawnAt: row.drawnAt,
        trigger: row.trigger,
        employee: {
          id: row.employeeId || null,
          firstName: row.employeeFirstName || 'Former Employee',
          lastName: row.employeeLastName || '',
          avatar: row.employeeAvatar || '',
        },
      }
    : null

function getGames() {
  const rows = db
    .prepare(
      `SELECT slug, name, cron, timezone, schedule_type AS scheduleType,
              schedule_payload AS schedulePayload, allow_repeat_winners AS allowRepeatWinners,
              gifts, created_at AS createdAt
       FROM games
       ORDER BY created_at`,
    )
    .all()
  return rows.map(shapeGame)
}

function getGame(slug) {
  const row = db
    .prepare(
      `SELECT slug, name, cron, timezone, schedule_type AS scheduleType,
              schedule_payload AS schedulePayload, allow_repeat_winners AS allowRepeatWinners,
              gifts, created_at AS createdAt
       FROM games
       WHERE slug = ?`,
    )
    .get(slug)
  return shapeGame(row)
}

function serializeSchedulePayload(payload) {
  if (!payload) return null
  if (typeof payload === 'string') return payload
  try {
    return JSON.stringify(payload)
  } catch (error) {
    return null
  }
}

function createGame({
  slug,
  name,
  cron,
  timezone,
  allowRepeatWinners = false,
  gifts = '',
  scheduleType = 'repeat',
  schedulePayload = null,
}) {
  const payload = serializeSchedulePayload(schedulePayload)
  db.prepare(
    'INSERT INTO games (slug, name, cron, timezone, allow_repeat_winners, gifts, schedule_type, schedule_payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    slug,
    name,
    cron,
    timezone,
    allowRepeatWinners ? 1 : 0,
    gifts || '',
    scheduleType,
    payload,
    new Date().toISOString(),
  )
  return getGame(slug)
}

function updateGame(slug, data) {
  const fields = []
  const values = []
  if (data.name) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.cron) {
    fields.push('cron = ?')
    values.push(data.cron)
  }
  if (data.timezone) {
    fields.push('timezone = ?')
    values.push(data.timezone)
  }
  if (typeof data.allowRepeatWinners === 'boolean') {
    fields.push('allow_repeat_winners = ?')
    values.push(data.allowRepeatWinners ? 1 : 0)
  }
  if (typeof data.gifts === 'string') {
    fields.push('gifts = ?')
    values.push(data.gifts)
  }
  if (data.scheduleType) {
    fields.push('schedule_type = ?')
    values.push(data.scheduleType)
  }
  if (Object.prototype.hasOwnProperty.call(data, 'schedulePayload')) {
    fields.push('schedule_payload = ?')
    values.push(serializeSchedulePayload(data.schedulePayload))
  }
  if (!fields.length) return getGame(slug)
  values.push(slug)
  db.prepare(`UPDATE games SET ${fields.join(', ')} WHERE slug = ?`).run(values)
  return getGame(slug)
}

function getEmployees(slug) {
  return db
    .prepare(
      `SELECT id, first_name AS firstName, last_name AS lastName, role, avatar, active
       FROM employees WHERE game_slug = ? ORDER BY created_at`,
    )
    .all(slug)
}

function createEmployee(slug, { firstName, lastName = '', role = '', avatar = '' }) {
  const stmt = db.prepare(
    `INSERT INTO employees (game_slug, first_name, last_name, role, avatar, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const info = stmt.run(slug, firstName, lastName, role, avatar, new Date().toISOString())
  return getEmployeeById(info.lastInsertRowid)
}

function updateEmployee(slug, id, data) {
  const fields = []
  const values = []
  if (typeof data.firstName === 'string') {
    fields.push('first_name = ?')
    values.push(data.firstName)
  }
  if (typeof data.lastName === 'string') {
    fields.push('last_name = ?')
    values.push(data.lastName)
  }
  if (typeof data.role === 'string') {
    fields.push('role = ?')
    values.push(data.role)
  }
  if (typeof data.avatar === 'string') {
    fields.push('avatar = ?')
    values.push(data.avatar)
  }
  if (typeof data.active === 'number') {
    fields.push('active = ?')
    values.push(data.active ? 1 : 0)
  }
  if (!fields.length) return getEmployeeById(id)
  values.push(slug, id)
  db.prepare(`UPDATE employees SET ${fields.join(', ')} WHERE game_slug=? AND id=?`).run(values)
  return getEmployeeById(id)
}

function deleteEmployee(slug, id) {
  db.prepare('DELETE FROM employees WHERE game_slug=? AND id=?').run(slug, id)
}

function getEmployeeById(id) {
  return db
    .prepare(
      'SELECT id, first_name AS firstName, last_name AS lastName, role, avatar, active FROM employees WHERE id=?',
    )
    .get(id)
}

function getRecentWinners(slug, limit = 6) {
  return db
    .prepare(
      `SELECT ${WINNER_BASE_SELECT}
       FROM winners
       WHERE game_slug = ?
       ORDER BY drawn_at DESC
       LIMIT ?`,
    )
    .all(slug, limit)
    .map(shapeWinner)
}

function getWinnerById(id) {
  const row = db
    .prepare(
      `SELECT ${WINNER_BASE_SELECT}
       FROM winners
       WHERE id = ?`,
    )
    .get(id)
  return shapeWinner(row)
}

function insertWinner({ id, slug, employeeId, trigger, snapshot = {} }) {
  db.prepare(
    `INSERT INTO winners (id, game_slug, employee_id, employee_first_name, employee_last_name, employee_avatar, drawn_at, trigger)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    slug,
    employeeId ?? null,
    snapshot.firstName || 'Former Employee',
    snapshot.lastName || '',
    snapshot.avatar || '',
    new Date().toISOString(),
    trigger,
  )
  return getWinnerById(id)
}

function getRecentWinnerIds(slug, limit) {
  return db
    .prepare(
      `SELECT employee_id FROM winners
       WHERE game_slug = ?
       ORDER BY drawn_at DESC
       LIMIT ?`,
    )
    .all(slug, limit)
    .map((row) => row.employee_id)
    .filter((id) => id)
}

function getWinnerSequence(slug) {
  const row = db
    .prepare(
      `SELECT COALESCE(MAX(rowid), 0) AS seq
       FROM winners
       WHERE game_slug = ?`,
    )
    .get(slug)
  return row?.seq || 0
}

function replaceEmployees(slug, entries = []) {
  const tx = db.transaction((roster) => {
    db.prepare('DELETE FROM employees WHERE game_slug=?').run(slug)
    const stmt = db.prepare(
      `INSERT INTO employees (game_slug, first_name, last_name, role, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    roster.forEach(({ firstName, lastName = '' }) => {
      if (!firstName) return
      stmt.run(slug, firstName, lastName, '', '', new Date().toISOString())
    })
  })

  tx(entries)
  return getEmployees(slug)
}

function activateAllEmployees(slug) {
  db.prepare('UPDATE employees SET active=1 WHERE game_slug=?').run(slug)
}

module.exports = {
  db,
  getGames,
  getGame,
  createGame,
  updateGame,
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getRecentWinners,
  insertWinner,
  getRecentWinnerIds,
  getWinnerSequence,
  replaceEmployees,
  activateAllEmployees,
}
