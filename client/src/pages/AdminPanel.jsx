import { useCallback, useEffect, useMemo, useState } from 'react'
import '../App.css'

const API_BASE = import.meta.env.VITE_API_URL ?? ''
const STORAGE_KEY = 'fortune-wheel-admin-secret'

const DAY_OPTIONS = [
  { value: 'SUN', label: 'Sunday' },
  { value: 'MON', label: 'Monday' },
  { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' },
  { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' },
  { value: 'SAT', label: 'Saturday' },
]
const RUN_ONCE_PLACEHOLDER_CRON = '0 0 * * *'

const defaultScheduleState = () => ({
  mode: 'repeat',
  frequency: 'week',
  timeOfDay: '13:00',
  hourMinute: '00',
  dayOfWeek: 'FRI',
  onceDate: '',
  onceTime: '13:00',
})

const sanitizeBulkInput = (value) =>
  value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^a-zA-Z0-9, ]+/g, '')
    .replace(/ {2,}/g, ' ')
    .trim()

const safeParseJSON = (value) => {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return null
  }
}

const padTime = (value) => String(value ?? '0').padStart(2, '0')

const formatTimeFromDate = (date) => `${padTime(date.getHours())}:${padTime(date.getMinutes())}`

const formatDateInput = (date) => `${date.getFullYear()}-${padTime(date.getMonth() + 1)}-${padTime(date.getDate())}`

const normalizeCronParts = (cron = '') => {
  const parts = cron.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 6) {
    return parts.slice(1)
  }
  return parts
}

const deriveFromCron = (cron) => {
  const result = {}
  const parts = normalizeCronParts(cron)
  if (parts.length < 5) {
    return result
  }
  const [minutePart, hourPart, dayOfMonth, , dayOfWeek] = parts
  if (minutePart?.startsWith('*/')) {
    result.frequency = 'minute'
    return result
  }
  if (
    hourPart === '*' &&
    dayOfMonth === '*' &&
    (!dayOfWeek || dayOfWeek === '*')
  ) {
    result.frequency = 'hour'
    result.hourMinute = padTime(parseInt(minutePart || '0', 10))
    return result
  }
  if (dayOfWeek && dayOfWeek !== '*') {
    result.frequency = 'week'
    result.dayOfWeek = dayOfWeek.toUpperCase()
    result.timeOfDay = `${padTime(parseInt(hourPart || '0', 10))}:${padTime(
      parseInt(minutePart || '0', 10),
    )}`
    return result
  }
  result.frequency = 'day'
  result.timeOfDay = `${padTime(parseInt(hourPart || '0', 10))}:${padTime(
    parseInt(minutePart || '0', 10),
  )}`
  return result
}

const buildCronFromSchedule = (schedule) => {
  const freq = schedule.frequency
  if (freq === 'minute') return '*/1 * * * *'
  if (freq === 'hour') {
    const minute = padTime(parseInt(schedule.hourMinute || '0', 10))
    return `${minute} * * * *`
  }
  const [hour = '13', minute = '00'] = (schedule.timeOfDay || '13:00').split(':')
  if (freq === 'day') {
    return `${padTime(minute)} ${padTime(hour)} * * *`
  }
  const day = schedule.dayOfWeek || 'FRI'
  return `${padTime(minute)} ${padTime(hour)} * * ${day}`
}

const buildScheduleRequest = (schedule) => {
  if (schedule.mode === 'once') {
    if (!schedule.onceDate || !schedule.onceTime) {
      throw new Error('Select both date and time for a one-time draw.')
    }
    const runAt = new Date(`${schedule.onceDate}T${schedule.onceTime}`)
    if (Number.isNaN(runAt.getTime())) {
      throw new Error('Invalid date or time for the one-time draw.')
    }
    return {
      scheduleType: 'once',
      cron: RUN_ONCE_PLACEHOLDER_CRON,
      schedulePayload: { mode: 'once', runAt: runAt.toISOString() },
    }
  }
  return {
    scheduleType: 'repeat',
    cron: buildCronFromSchedule(schedule),
    schedulePayload: {
      mode: 'repeat',
      frequency: schedule.frequency,
      timeOfDay: schedule.timeOfDay,
      hourMinute: schedule.hourMinute,
      dayOfWeek: schedule.dayOfWeek,
    },
  }
}

const deriveScheduleState = (game) => {
  const base = defaultScheduleState()
  if (!game) return base
  const scheduleType = game.scheduleType || 'repeat'
  const payload = safeParseJSON(game.schedulePayload)
  if (scheduleType === 'once') {
    base.mode = 'once'
    const runAt = payload?.runAt
    if (runAt) {
      const date = new Date(runAt)
      if (!Number.isNaN(date.getTime())) {
        base.onceDate = formatDateInput(date)
        base.onceTime = formatTimeFromDate(date)
      }
    }
    return base
  }
  base.mode = 'repeat'
  const cronDerived = deriveFromCron(game.cron)
  let nextState = { ...base, ...cronDerived }
  if (payload) {
    if (payload.frequency) {
      nextState = { ...nextState, frequency: payload.frequency }
    }
    if (payload.timeOfDay) {
      nextState = { ...nextState, timeOfDay: payload.timeOfDay }
    }
    if (payload.hourMinute !== undefined) {
      nextState = { ...nextState, hourMinute: padTime(payload.hourMinute) }
    }
    if (payload.dayOfWeek) {
      nextState = { ...nextState, dayOfWeek: payload.dayOfWeek }
    }
  }
  return nextState
}

const ScheduleControls = ({ schedule, onChange, name = 'schedule-mode' }) => {
  const update = (patch) => onChange({ ...schedule, ...patch })
  return (
    <div className="schedule-builder">
      <p className="schedule-builder__label">Schedule</p>
      <div className="schedule-builder__modes">
        <label>
          <input
            type="radio"
            name={name}
            checked={schedule.mode === 'repeat'}
            onChange={() => update({ mode: 'repeat' })}
          />
          Repeat
        </label>
        <label>
          <input
            type="radio"
            name={name}
            checked={schedule.mode === 'once'}
            onChange={() => update({ mode: 'once' })}
          />
          Run once
        </label>
      </div>
      {schedule.mode === 'repeat' ? (
        <div className="schedule-builder__repeat">
          <label>
            Frequency
            <select
              value={schedule.frequency}
              onChange={(event) => update({ frequency: event.target.value })}
            >
              <option value="minute">Every minute</option>
              <option value="hour">Every hour</option>
              <option value="day">Every day</option>
              <option value="week">Every week</option>
            </select>
          </label>
          {schedule.frequency === 'hour' && (
            <label>
              Minute offset
              <input
                type="number"
                min="0"
                max="59"
                value={parseInt(schedule.hourMinute, 10)}
                onChange={(event) => {
                  const raw = Number.isNaN(Number(event.target.value))
                    ? 0
                    : parseInt(event.target.value, 10)
                  const clamped = Math.min(59, Math.max(0, raw))
                  update({ hourMinute: padTime(clamped) })
                }}
              />
            </label>
          )}
          {schedule.frequency === 'week' && (
            <label>
              Day of week
              <select
                value={schedule.dayOfWeek}
                onChange={(event) => update({ dayOfWeek: event.target.value })}
              >
                {DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {schedule.frequency !== 'minute' && schedule.frequency !== 'hour' && (
            <label>
              Time
              <input
                type="time"
                value={schedule.timeOfDay}
                onChange={(event) => update({ timeOfDay: event.target.value })}
              />
            </label>
          )}
          {schedule.frequency === 'hour' && (
            <p className="schedule-builder__hint">Spin occurs every hour at the selected minute.</p>
          )}
          {schedule.frequency === 'minute' && (
            <p className="schedule-builder__hint">Spin repeats every minute.</p>
          )}
        </div>
      ) : (
        <div className="schedule-builder__once">
          <label>
            Date
            <input
              type="date"
              value={schedule.onceDate}
              onChange={(event) => update({ onceDate: event.target.value })}
            />
          </label>
          <label>
            Time
            <input
              type="time"
              value={schedule.onceTime}
              onChange={(event) => update({ onceTime: event.target.value })}
            />
          </label>
          <p className="schedule-builder__hint">
            The wheel will automatically spin once at the selected moment.
          </p>
        </div>
      )}
    </div>
  )
}

const AdminPanel = () => {
  const [secret, setSecret] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [passwordInput, setPasswordInput] = useState('')
  const [authError, setAuthError] = useState('')
  const [games, setGames] = useState([])
  const [selectedGame, setSelectedGame] = useState('')
  const [newGameSlug, setNewGameSlug] = useState('')
  const [newSchedule, setNewSchedule] = useState(() => defaultScheduleState())
  const [editingSchedule, setEditingSchedule] = useState(() => defaultScheduleState())
  const [bulkEmployees, setBulkEmployees] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const authed = Boolean(secret)

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
          ...(authed ? { Authorization: `Bearer ${secret}` } : {}),
        },
        ...options,
      })
      if (!response.ok) {
        let message = response.statusText
        try {
          const payload = await response.json()
          message = payload.message || message
        } catch (err) {
          /* noop */
        }
        throw new Error(message)
      }
      return response.json()
    },
    [secret, authed],
  )

  const handleLogin = async (event) => {
    event.preventDefault()
    try {
      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': passwordInput,
        },
        body: JSON.stringify({ password: passwordInput }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload.message || 'Invalid password')
      }
      localStorage.setItem(STORAGE_KEY, passwordInput)
      setSecret(passwordInput)
      setPasswordInput('')
      setAuthError('')
    } catch (err) {
      setAuthError(err.message)
    }
  }

  const fetchGames = useCallback(async () => {
    if (!authed) return
    setLoading(true)
    try {
      const result = await request('/api/admin/games')
      setGames(result.games ?? [])
      if (!selectedGame && result.games?.length) {
        setSelectedGame(result.games[0].slug)
      }
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authed, request, selectedGame])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  const fetchEmployees = useCallback(async () => {
    if (!authed || !selectedGame) return
    try {
      const result = await request(`/api/admin/${selectedGame}/employees`)
      const list = result.employees ?? []
      const combined = list.map((emp) => `${emp.firstName} ${emp.lastName}`.trim()).join(', ')
      setBulkEmployees(sanitizeBulkInput(combined))
    } catch (err) {
      setError(err.message)
    }
  }, [authed, request, selectedGame])

  useEffect(() => {
    fetchEmployees()
  }, [fetchEmployees])

  const handleCreateGame = async (event) => {
    event.preventDefault()
    if (!newGameSlug) return
    try {
      const scheduleRequest = buildScheduleRequest(newSchedule)
      await request('/api/admin/games', {
        method: 'POST',
        body: JSON.stringify({ slug: newGameSlug, ...scheduleRequest }),
      })
      setNewGameSlug('')
      setNewSchedule(defaultScheduleState())
      setShowCreateForm(false)
      fetchGames()
    } catch (err) {
      setError(err.message)
    }
  }

  const currentGame = useMemo(
    () => games.find((game) => game.slug === selectedGame),
    [games, selectedGame],
  )

  useEffect(() => {
    if (currentGame) {
      setEditingSchedule(deriveScheduleState(currentGame))
    } else {
      setEditingSchedule(defaultScheduleState())
    }
  }, [currentGame])

  if (!authed) {
    return (
      <main className="app-shell">
        <section className="admin-login">
          <h1>Wheel Admin</h1>
          <form onSubmit={handleLogin} className="admin-form">
            <label htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              type="password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Enter admin password"
            />
            <button type="submit">Sign In</button>
            {authError && <p className="status-text status-text--alert">{authError}</p>}
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <h1>Wheel Admin</h1>
          <p>Manage games, schedules, and employee rosters.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY)
            setSecret('')
            setGames([])
            setBulkEmployees('')
            setSelectedGame('')
            setNewGameSlug('')
            setNewSchedule(defaultScheduleState())
            setEditingSchedule(defaultScheduleState())
          }}
        >
          Sign Out
        </button>
      </header>

      {error && <p className="status-text status-text--alert">{error}</p>}

      <section className="admin-split">
        <div className="admin-card admin-card--games">
          <div className="admin-card__header">
            <h2>Games</h2>
            <button
              type="button"
              onClick={() =>
                setShowCreateForm((prev) => {
                  const next = !prev
                  if (next) {
                    setNewGameSlug('')
                    setNewSchedule(defaultScheduleState())
                  }
                  return next
                })
              }
            >
              {showCreateForm ? 'Close' : 'Create game'}
            </button>
          </div>
          {loading ? (
            <p>Loading games…</p>
          ) : (
            <ul className="admin-list">
              {games.map((game) => (
                <li key={game.slug}>
                  <button
                    type="button"
                    className={game.slug === selectedGame ? 'admin-list__item--active' : ''}
                    onClick={() => setSelectedGame(game.slug)}
                  >
                    <strong>{game.slug}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {showCreateForm && (
            <form className="admin-form" onSubmit={handleCreateGame}>
              <h3>New Game</h3>
              <input
                value={newGameSlug}
                onChange={(event) => setNewGameSlug(event.target.value)}
                placeholder="Game Name (letters only)"
                required
              />
              <ScheduleControls schedule={newSchedule} onChange={setNewSchedule} name="new-schedule" />
              <button type="submit">Create Game</button>
            </form>
          )}
        </div>

        <div className="admin-card admin-card--detail">
          {currentGame ? (
            <>
              <form
                className="admin-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!currentGame.slug) return
                  const entries = bulkEmployees
                    .split(',')
                    .map((entry) => entry.trim())
                    .filter(Boolean)
                    .map((entry) => {
                      const parts = entry.split(/\s+/)
                      const firstName = parts.shift()
                      const lastName = parts.join(' ')
                      return { firstName, lastName }
                    })
                    .filter((entry) => entry.firstName)
                  try {
                    const scheduleRequest = buildScheduleRequest(editingSchedule)
                    await request(`/api/admin/${currentGame.slug}/config`, {
                      method: 'PATCH',
                      body: JSON.stringify(scheduleRequest),
                    })
                    await request(`/api/admin/${currentGame.slug}/employees`, {
                      method: 'PUT',
                      body: JSON.stringify({ employees: entries }),
                    })
                    await Promise.all([fetchGames(), fetchEmployees()])
                    setError('')
                  } catch (err) {
                    setError(err.message)
                  }
                }}
              >
                <h3>Game Settings · {currentGame.slug}</h3>
                <div className="admin-form__inline">
                  <ScheduleControls
                    schedule={editingSchedule}
                    onChange={setEditingSchedule}
                    name="edit-schedule"
                  />
                </div>
                <div className="admin-form__group">
                  <label htmlFor="bulk-employees">Employees</label>
                  <textarea
                    id="bulk-employees"
                    rows={6}
                    value={bulkEmployees}
                    onChange={(event) => setBulkEmployees(sanitizeBulkInput(event.target.value))}
                    placeholder="Jane Doe, John Smith, Maria"
                  />
                  <p className="schedule-builder__hint">
                    Enter comma separated first/last names. Existing winners remain untouched.
                  </p>
                </div>
                <button type="submit">Save Changes</button>
              </form>
            </>
          ) : (
            <div className="admin-empty-state">
              <h2>Select a game</h2>
              <p>Pick a game from the list to edit its schedule and roster.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default AdminPanel
