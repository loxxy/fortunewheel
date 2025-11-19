require('dotenv').config()

const express = require('express')
const cors = require('cors')
const cron = require('node-cron')
const { CronExpressionParser } = require('cron-parser')
const { randomUUID } = require('crypto')

const {
  db,
  getGames,
  getGame,
  createGame,
  updateGame,
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getRecentWinners,
  insertWinner,
  getRecentWinnerIds,
  replaceEmployees,
} = require('./db')

const PORT = process.env.PORT || 4000
const DEFAULT_CRON = process.env.DRAW_CRON || '0 0 13 * * FRI'
const DEFAULT_TZ = process.env.DRAW_TIMEZONE || 'America/Toronto'
const WINNER_HISTORY_LIMIT = parseInt(process.env.WINNER_HISTORY_LIMIT || '40', 10)
const REPEAT_COOLDOWN = parseInt(process.env.REPEAT_COOLDOWN || '3', 10)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password'
const RUN_ONCE_PLACEHOLDER_CRON = '0 0 * * *'

const app = express()
app.use(cors())
app.use(express.json())

const scheduledJobs = new Map()

function parseSchedulePayload(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try {
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

function getNextDrawDate(cronExpr, timezone) {
  try {
    const interval = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(),
      tz: timezone,
    })
    return interval.next().toDate()
  } catch (error) {
    console.error('Unable to parse cron', error)
    return null
  }
}

function getRunOnceDate(game) {
  if (!game) return null
  const payload = parseSchedulePayload(game.schedulePayload)
  if (!payload?.runAt) return null
  const date = new Date(payload.runAt)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function getUpcomingDraw(game) {
  if (!game) return null
  if ((game.scheduleType || 'repeat') === 'once') {
    const runDate = getRunOnceDate(game)
    if (!runDate) return null
    if (runDate.getTime() <= Date.now()) return null
    return runDate
  }
  const timezone = game.timezone || DEFAULT_TZ
  return getNextDrawDate(game.cron, timezone)
}

function logScheduledFailure(slug, error) {
  if (!error) return
  const message = error.message || ''
  if (message.toLowerCase().includes('no employees configured')) {
    console.warn(`Skipping scheduled draw for ${slug}: ${message}`)
  } else {
    console.error(`Scheduled draw failed for ${slug}`, error)
  }
}

function runScheduledDraw(slug) {
  try {
    drawWinner(slug, 'scheduled')
  } catch (error) {
    logScheduledFailure(slug, error)
  }
}

function scheduleGame(game) {
  if (!game) return
  const existing = scheduledJobs.get(game.slug)
  if (existing?.stop) {
    existing.stop()
  }
  scheduledJobs.delete(game.slug)
  const scheduleType = game.scheduleType || 'repeat'
  if (scheduleType === 'once') {
    const runDate = getRunOnceDate(game)
    if (!runDate) {
      console.warn(`Cannot schedule one-time draw for ${game.slug}: invalid date`)
      return
    }
    const delay = runDate.getTime() - Date.now()
    if (delay <= 0) {
      console.warn(`One-time draw for ${game.slug} is in the past; skipping auto schedule`)
      return
    }
    const timeoutId = setTimeout(() => {
      runScheduledDraw(game.slug)
      const payload = parseSchedulePayload(game.schedulePayload) || {}
      updateGame(game.slug, {
        schedulePayload: { ...payload, completedAt: new Date().toISOString() },
      })
      scheduledJobs.delete(game.slug)
    }, delay)
    scheduledJobs.set(game.slug, { stop: () => clearTimeout(timeoutId) })
    return
  }
  const timezone = game.timezone || DEFAULT_TZ
  const task = cron.schedule(
    game.cron,
    () => {
      runScheduledDraw(game.slug)
    },
    { timezone },
  )
  scheduledJobs.set(game.slug, { stop: () => task.stop() })
}

function scheduleAllGames() {
  getGames().forEach(scheduleGame)
}

scheduleAllGames()

function selectRandomEmployee(slug) {
  const employees = getEmployees(slug).filter((emp) => emp.active !== 0)
  if (!employees.length) {
    throw new Error(`No employees configured for ${slug}`)
  }
  const recentIds = new Set(getRecentWinnerIds(slug, REPEAT_COOLDOWN))
  const pool =
    employees.length > recentIds.size
      ? employees.filter((emp) => !recentIds.has(emp.id))
      : employees
  return pool[Math.floor(Math.random() * pool.length)]
}

function drawWinner(slug, trigger = 'manual') {
  const game = getGame(slug)
  if (!game) throw new Error(`Game ${slug} not found`)
  const employee = selectRandomEmployee(slug)
  const winner = insertWinner({
    id: randomUUID(),
    slug,
    employeeId: employee.id,
    trigger,
    snapshot: {
      firstName: employee.firstName,
      lastName: employee.lastName,
      avatar: employee.avatar,
    },
  })
  if (WINNER_HISTORY_LIMIT > 0) {
    db.prepare(
      'DELETE FROM winners WHERE game_slug=? AND id NOT IN (SELECT id FROM winners WHERE game_slug=? ORDER BY drawn_at DESC LIMIT ?)',
    ).run(slug, slug, WINNER_HISTORY_LIMIT)
  }
  return winner
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.replace('Bearer ', '')
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ message: 'Admin authentication required' })
  }
  return next()
}

function respondGame(slug, res) {
  const game = getGame(slug)
  if (!game) {
    res.status(404).json({ message: 'Game not found' })
    return null
  }
  return game
}

app.get('/api/:slug/employees', (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  res.json({ employees: getEmployees(game.slug) })
})

app.get('/api/:slug/winners', (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  const limit = parseInt(req.query.limit, 10) || 6
  res.json({ winners: getRecentWinners(game.slug, limit) })
})

app.post('/api/:slug/spin', (req, res) => {
  try {
    const winner = drawWinner(req.params.slug, 'manual')
    res.json({ winner })
  } catch (error) {
    res.status(400).json({ message: error.message })
  }
})

app.get('/api/:slug/config', (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  res.json({
    cron: game.cron,
    timezone: game.timezone || DEFAULT_TZ,
    nextDrawAt: getUpcomingDraw(game),
    scheduleType: game.scheduleType || 'repeat',
    schedulePayload: parseSchedulePayload(game.schedulePayload),
  })
})

app.post('/api/admin/login', (req, res) => {
  const password =
    req.body?.password ||
    req.headers['x-admin-password'] ||
    req.query.password ||
    ''

    console.log(password," | " ,ADMIN_PASSWORD);
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true })
  } else {
    res.status(401).json({ message: 'Invalid password' })
  }
})

app.get('/api/admin/games', requireAdmin, (_req, res) => {
  res.json({ games: getGames() })
})

app.post('/api/admin/games', requireAdmin, (req, res) => {
  const { slug, cron, scheduleType, schedulePayload } = req.body || {}
  if (!slug) {
    return res.status(400).json({ message: 'slug is required' })
  }
  const type = scheduleType === 'once' ? 'once' : 'repeat'
  const gameCron = type === 'once' ? cron || RUN_ONCE_PLACEHOLDER_CRON : cron || DEFAULT_CRON
  const payload = schedulePayload || null
  try {
    const game = createGame({
      slug: slug.toLowerCase(),
      name: slug.toLowerCase(),
      cron: gameCron,
      timezone: DEFAULT_TZ,
      scheduleType: type,
      schedulePayload: payload,
    })
    scheduleGame(game)
    return res.status(201).json({ game })
  } catch (error) {
    return res.status(400).json({ message: error.message })
  }
})

app.patch('/api/admin/:slug/config', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  const type = req.body?.scheduleType === 'once' ? 'once' : req.body?.scheduleType || game.scheduleType || 'repeat'
  const cronValue =
    type === 'once'
      ? req.body?.cron || RUN_ONCE_PLACEHOLDER_CRON
      : req.body?.cron || game.cron || DEFAULT_CRON
  const updated = updateGame(game.slug, {
    name: game.slug,
    cron: cronValue,
    timezone: DEFAULT_TZ,
    scheduleType: type,
    schedulePayload: req.body?.schedulePayload || null,
  })
  scheduleGame(updated)
  res.json({ game: updated })
})

app.get('/api/admin/:slug/employees', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  res.json({ employees: getEmployees(game.slug) })
})

app.post('/api/admin/:slug/employees', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  const { firstName } = req.body || {}
  if (!firstName) {
    return res.status(400).json({ message: 'firstName is required' })
  }
  const employee = createEmployee(game.slug, req.body)
  res.status(201).json({ employee })
})

app.patch('/api/admin/:slug/employees/:id', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  const employee = updateEmployee(game.slug, Number(req.params.id), req.body || {})
  res.json({ employee })
})

app.delete('/api/admin/:slug/employees/:id', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  deleteEmployee(game.slug, Number(req.params.id))
  res.status(204).end()
})

app.put('/api/admin/:slug/employees', requireAdmin, (req, res) => {
  const game = respondGame(req.params.slug, res)
  if (!game) return
  const roster = Array.isArray(req.body?.employees) ? req.body.employees : []
  const cleaned = roster
    .map((entry) => ({
      firstName: entry.firstName?.trim(),
      lastName: entry.lastName?.trim() || '',
    }))
    .filter((entry) => entry.firstName)
  const updated = replaceEmployees(game.slug, cleaned)
  res.json({ employees: updated })
})

app.use((req, res) => {
  res.status(404).json({ message: 'Not found' })
})

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Fortune wheel server listening on port ${PORT}`)
  })
}

module.exports = app
