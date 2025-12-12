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

const sanitizeBulkInput = (value) => (value || '').replace(/\r\n/g, '\n')

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

const parseRosterText = (text) =>
  (text || '')
    .split(/[,\n]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/)
      const firstName = parts.shift()
      const lastName = parts.join(' ')
      return { firstName, lastName }
    })
    .filter((entry) => entry.firstName)

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
  const [formSlug, setFormSlug] = useState('')
  const [editingSchedule, setEditingSchedule] = useState(() => defaultScheduleState())
  const [allowRepeats, setAllowRepeats] = useState(true)
  const [roster, setRoster] = useState([])
  const [bulkAddInput, setBulkAddInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [detailStatus, setDetailStatus] = useState('')
  const [savingStatus, setSavingStatus] = useState('')
  const [error, setError] = useState('')
  const [isCreating, setIsCreating] = useState(false)

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
      if (!isCreating && !selectedGame && result.games?.length) {
        setSelectedGame(result.games[0].slug)
      }
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [authed, request, selectedGame, isCreating])

  useEffect(() => {
    fetchGames()
  }, [fetchGames])

  const fetchEmployees = useCallback(
    async (overrideSlug) => {
      const targetSlug = overrideSlug || selectedGame
      if (!authed || !targetSlug) return
      setDetailStatus('Loading game details…')
      try {
        const result = await request(`/api/admin/${targetSlug}/employees`)
        const list = result.employees ?? []
        setRoster(list)
        setBulkAddInput('')
        setDetailStatus('')
      } catch (err) {
        setError(err.message)
        setDetailStatus('')
      }
    },
    [authed, request, selectedGame],
  )

  useEffect(() => {
    if (!isCreating) {
      fetchEmployees()
    }
  }, [fetchEmployees, isCreating])

  const handleAddBulk = () => {
    const entries = parseRosterText(bulkAddInput)
    if (!entries.length) {
      setError('Enter at least one name to add.')
      return
    }
    const timestamp = Date.now()
    const existingKeys = new Set(
      roster.map((emp) => `${emp.firstName?.toLowerCase() || ''}|${emp.lastName?.toLowerCase() || ''}`),
    )
    const localKeys = new Set()
    for (const entry of entries) {
      const key = `${entry.firstName.toLowerCase()}|${entry.lastName.toLowerCase()}`
      if (existingKeys.has(key) || localKeys.has(key)) {
        const name = `${entry.firstName} ${entry.lastName}`.trim()
        setError(`Duplicate name: ${name}`)
        if (typeof window !== 'undefined') {
          window.alert(`Duplicate name: ${name}`)
        }
        return
      }
      localKeys.add(key)
    }
    const enriched = entries.map((entry, idx) => ({
      ...entry,
      id: entry.id || `local-${timestamp}-${idx}`,
    }))
    setRoster((prev) => [...prev, ...enriched])
    setBulkAddInput('')
    setError('')
  }

  const saveRosterForSlug = useCallback(
    async (slug) => {
      if (!slug) return
      await request(`/api/admin/${slug}/employees`, {
        method: 'PUT',
        body: JSON.stringify({
          employees: roster.map((emp) => ({ firstName: emp.firstName, lastName: emp.lastName })),
        }),
      })
    },
    [request, roster],
  )

  const handleRemoveEmployee = (index) => {
    setRoster((prev) => prev.filter((_, idx) => idx !== index))
  }


  const handleSelectGame = (slug) => {
    setIsCreating(false)
    setError('')
    setSelectedGame(slug)
    setFormSlug(slug)
    setDetailStatus('Loading game details…')
    setAllowRepeats(true)
    setRoster([])
    setEditingSchedule(defaultScheduleState())
  }

  const currentGame = useMemo(
    () => (!isCreating ? games.find((game) => game.slug === selectedGame) : null),
    [games, selectedGame, isCreating],
  )

  useEffect(() => {
    if (currentGame) {
      setEditingSchedule(deriveScheduleState(currentGame))
      setAllowRepeats(currentGame.allowRepeatWinners ?? true)
      setFormSlug(currentGame.slug)
      setDetailStatus('')
    } else if (isCreating) {
      setEditingSchedule(defaultScheduleState())
      setAllowRepeats(true)
      setFormSlug('')
      setDetailStatus('Ready to create a new game.')
    } else {
      setEditingSchedule(defaultScheduleState())
    }
  }, [currentGame, isCreating])

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
            setRoster([])
            setBulkAddInput('')
            setSelectedGame('')
            setFormSlug('')
            setEditingSchedule(defaultScheduleState())
            setAllowRepeats(true)
            setIsCreating(false)
            setDetailStatus('')
            setSavingStatus('')
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
              onClick={() => {
                setIsCreating(true)
                setSelectedGame('')
                setFormSlug('')
                setRoster([])
                setEditingSchedule(defaultScheduleState())
                setDetailStatus('Ready to create a new game.')
              }}
            >
              Create game
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
                    className={game.slug === selectedGame && !isCreating ? 'admin-list__item--active' : ''}
                    onClick={() => handleSelectGame(game.slug)}
                  >
                    <strong>{game.slug}</strong>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="admin-card admin-card--detail">
          {isCreating || currentGame ? (
            <div className="admin-triple">
              <div className="admin-card admin-card--panel">
                <form
                  className="admin-form"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    const targetSlug = isCreating ? formSlug.trim().toLowerCase() : currentGame?.slug
                    if (!targetSlug) {
                      setError('Enter a game name.')
                      return
                    }
                    if (!editingSchedule) return
                    setSavingStatus(isCreating ? 'Creating game…' : 'Saving game…')
                    try {
                      const scheduleRequest = buildScheduleRequest(editingSchedule)
                      if (isCreating) {
                        await request('/api/admin/games', {
                          method: 'POST',
                          body: JSON.stringify({ slug: targetSlug, allowRepeatWinners: allowRepeats, ...scheduleRequest }),
                        })
                      } else if (currentGame?.slug) {
                        await request(`/api/admin/${currentGame.slug}/config`, {
                          method: 'PATCH',
                          body: JSON.stringify({ ...scheduleRequest, allowRepeatWinners: allowRepeats }),
                        })
                      }
                      await saveRosterForSlug(targetSlug)
                      await fetchGames()
                      await fetchEmployees(targetSlug)
                      setSelectedGame(targetSlug)
                      setIsCreating(false)
                      setFormSlug(targetSlug)
                      setDetailStatus('')
                      setError('')
                    } catch (err) {
                      setError(err.message)
                    } finally {
                      setSavingStatus('')
                    }
                  }}
                >
                  <h3>{isCreating ? 'Create Game' : `Game Settings · ${currentGame?.slug}`}</h3>
                  <div className="admin-form__group">
                    <label htmlFor="game-slug">Game name</label>
                    <input
                      id="game-slug"
                      value={formSlug}
                      disabled={!isCreating}
                      onChange={(event) => setFormSlug(event.target.value)}
                      placeholder="e.g. sales"
                      required
                    />
                  </div>
                  <div className="admin-form__inline">
                    <ScheduleControls
                      schedule={editingSchedule}
                      onChange={setEditingSchedule}
                      name="edit-schedule"
                    />
                  </div>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={allowRepeats}
                      onChange={(event) => setAllowRepeats(event.target.checked)}
                    />
                    <span>Allow repeat winners</span>
                  </label>
                  {detailStatus && <p className="status-text">{detailStatus}</p>}
                  {savingStatus && <p className="status-text">{savingStatus}</p>}
                  <button type="submit" disabled={Boolean(savingStatus)}>
                    {isCreating ? 'Create Game' : 'Save Game'}
                  </button>
                </form>
              </div>

              <div className="admin-card admin-card--roster">
                <div className="admin-card__header">
                  <h3>Employee List · {formSlug || currentGame?.slug || 'new'}</h3>
                  <span>{roster.length} names</span>
                </div>
                <div className="roster-table">
                  {roster.length ? (
                    roster.map((emp, index) => {
                      const inactive = !allowRepeats && emp.active === 0
                      return (
                        <div
                          key={emp.id || `emp-${index}`}
                          className={inactive ? 'roster-table__row roster-table__row--inactive' : 'roster-table__row'}
                        >
                          <span className="roster-table__index">{index + 1}.</span>
                          <div className="roster-table__name-group">
                            <span className="roster-table__name">
                              {`${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim()}
                            </span>
                            {inactive && <span className="roster-table__status">Inactive</span>}
                          </div>
                          <button
                            type="button"
                            className="roster-table__delete"
                            aria-label={`Remove ${emp.firstName}`}
                            onClick={() => handleRemoveEmployee(index)}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })
                  ) : (
                    <p className="roster-table__empty">No employees yet.</p>
                  )}
                </div>
                <div className="admin-form__group">
                  <label htmlFor="bulk-add">Bulk add (comma or newline separated)</label>
                  <textarea
                    id="bulk-add"
                    rows={4}
                    value={bulkAddInput}
                    onChange={(event) => setBulkAddInput(event.target.value)}
                    placeholder="Jane Doe, John Smith, Maria"
                  />
                  <div className="admin-form__inline">
                    <button type="button" className="admin-form__button" onClick={handleAddBulk}>
                      Add to List
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="admin-empty-state">
              <h2>Select a game</h2>
              <p>Pick a game from the list to edit its schedule and roster, or create a new one.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

export default AdminPanel
