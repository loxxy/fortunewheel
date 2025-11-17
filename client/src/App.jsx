import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Wheel from './components/Wheel'
import WinnerList from './components/WinnerList'
import Countdown from './components/Countdown'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })

  if (!response.ok) {
    let reason = ''
    try {
      const payload = await response.json()
      reason = payload.message
    } catch (error) {
      reason = error?.message ?? ''
    }
    throw new Error(reason || `Request failed (${response.status})`)
  }

  return response.json()
}

const IDLE_INTERVAL_MS = 60

const App = () => {
  const [employees, setEmployees] = useState([])
  const [winners, setWinners] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayedWinnerId, setDisplayedWinnerId] = useState(null)
  const [activeWinner, setActiveWinner] = useState(null)
  const spinTimeoutRef = useRef(null)
  const drawTimerRef = useRef(null)
  const idleIntervalRef = useRef(null)
  const idleResumeRef = useRef(null)
  const audioCtxRef = useRef(null)
  const lastTickTimeRef = useRef(0)
  const lastPointerIndexRef = useRef(null)
  const employeesCountRef = useRef(0)

  const fetchEmployees = useCallback(async () => {
    const result = await request('/api/employees')
    setEmployees(result.employees ?? [])
  }, [])

  const fetchWinners = useCallback(async () => {
    const result = await request('/api/winners?limit=6')
    setWinners(result.winners ?? [])
  }, [])

  const fetchConfig = useCallback(async () => {
    const result = await request('/api/config')
    setConfig(result)
  }, [])

  const getAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (audioCtxRef.current) return audioCtxRef.current
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    audioCtxRef.current = new AudioCtx()
    return audioCtxRef.current
  }, [])

  const playTick = useCallback(() => {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    if (now - lastTickTimeRef.current < 0.02) return
    lastTickTimeRef.current = now
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = 650
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.35, now + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.1)
  }, [getAudioContext])

  const startIdleMotion = useCallback(() => {
    if (idleIntervalRef.current || isSpinning) return
    idleIntervalRef.current = setInterval(() => {
      const count = employeesCountRef.current || 1
      const slicePerSecond = 360 / count
      const delta = (slicePerSecond / 1000) * IDLE_INTERVAL_MS
      setRotation((prev) => prev + delta)
    }, IDLE_INTERVAL_MS)
  }, [isSpinning])

  const stopIdleMotion = useCallback(() => {
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current)
      idleIntervalRef.current = null
    }
  }, [])

  const spinToWinner = useCallback(
    (winner) => {
      if (!winner?.employee || !employees.length) return
      const index = employees.findIndex((emp) => emp.id === winner.employee.id)
      if (index === -1) return
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current)
      }
      if (idleResumeRef.current) {
        clearTimeout(idleResumeRef.current)
      }
      stopIdleMotion()
      const sliceAngle = 360 / employees.length
      const randomJitter = (Math.random() - 0.5) * sliceAngle * 0.4
      const targetAngle = index * sliceAngle + sliceAngle / 2
      const rotations = 4 + Math.floor(Math.random() * 3)
      setIsSpinning(true)
      setActiveWinner(winner)
      setRotation((prev) => prev + rotations * 360 + (360 - targetAngle) + randomJitter)
      spinTimeoutRef.current = setTimeout(() => {
        setIsSpinning(false)
        idleResumeRef.current = setTimeout(() => {
          startIdleMotion()
        }, 8000)
      }, 5200)
    },
    [employees, startIdleMotion, stopIdleMotion],
  )

  useEffect(() => {
    startIdleMotion()
    ;(async () => {
      try {
        setError(null)
        await Promise.all([fetchEmployees(), fetchWinners(), fetchConfig()])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      stopIdleMotion()
    }
  }, [fetchEmployees, fetchWinners, fetchConfig, startIdleMotion, stopIdleMotion])

  useEffect(() => {
    const interval = setInterval(() => {
      fetchWinners()
      fetchConfig()
    }, 20000)
    return () => clearInterval(interval)
  }, [fetchWinners, fetchConfig])

  useEffect(() => {
    if (!config?.nextDrawAt) return undefined
    if (drawTimerRef.current) {
      clearTimeout(drawTimerRef.current)
    }
    const target = new Date(config.nextDrawAt).getTime()
    if (Number.isNaN(target)) {
      return undefined
    }
    const delay = Math.max(target - Date.now() + 2000, 0)
    drawTimerRef.current = setTimeout(() => {
      fetchWinners()
      fetchConfig()
    }, delay)
    return () => {
      if (drawTimerRef.current) {
        clearTimeout(drawTimerRef.current)
      }
    }
  }, [config, fetchWinners, fetchConfig])

  const displayedWinners = useMemo(() => winners.slice(0, 3), [winners])

  const pointerInfo = useMemo(() => {
    if (!employees.length) return { employee: null, index: null }
    const normalizedRotation = ((rotation % 360) + 360) % 360
    const pointerAngle = (360 - normalizedRotation + 360) % 360
    const slice = 360 / employees.length
    const index = Math.floor(pointerAngle / slice) % employees.length
    return { employee: employees[index], index }
  }, [rotation, employees])
  const pointerEmployee = pointerInfo.employee

  useEffect(() => {
    if (!winners.length || !employees.length) return
    if (winners[0].id === displayedWinnerId) return
    setDisplayedWinnerId(winners[0].id)
    spinToWinner(winners[0])
  }, [winners, displayedWinnerId, spinToWinner, employees.length])

  useEffect(() => {
    const index = pointerInfo.index
    if (index === null || index === undefined) return
    if (lastPointerIndexRef.current === index) return
    lastPointerIndexRef.current = index
    playTick()
  }, [pointerInfo.index, playTick])

  useEffect(() => {
    const resumeAudio = () => {
      const ctx = getAudioContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    }
    window.addEventListener('pointerdown', resumeAudio, { passive: true })
    window.addEventListener('keydown', resumeAudio, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', resumeAudio)
      window.removeEventListener('keydown', resumeAudio)
    }
  }, [getAudioContext])

  useEffect(() => {
    employeesCountRef.current = employees.length
  }, [employees.length])

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
      if (drawTimerRef.current) clearTimeout(drawTimerRef.current)
      if (idleResumeRef.current) clearTimeout(idleResumeRef.current)
      stopIdleMotion()
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {})
      }
    }
  }, [stopIdleMotion])

  if (loading) {
    return (
      <main className="app-shell">
        <p>Booting the wheel...</p>
      </main>
    )
  }

  const scheduleMeta = config
    ? `Fridays · ${config.cron} (${config.timezone})`
    : 'Schedule unavailable'

  return (
    <div className="app-shell">
      {error && <p className="status-text status-text--alert">⚠️ {error}</p>}
      <section className="main-grid">
        <div className="wheel-panel">
          <Wheel
            employees={employees}
            rotation={rotation}
            isSpinning={isSpinning}
            highlightedId={activeWinner?.employee?.id}
          />
        </div>
        <div className="side-stack">
          <div className="info-card">
            <div>
              <p className="info-card__label">Next Draw</p>
              <Countdown target={config?.nextDrawAt} label="Auto spin in" />
            </div>
            <p className="info-card__meta">{scheduleMeta}</p>
          </div>
          <div className="pointer-card">
            <div className="pointer-card__avatar">
              <span>{pointerEmployee?.firstName?.[0]?.toUpperCase() ?? '?'}</span>
            </div>
            <div className="pointer-card__marker" aria-hidden="true" />
            <h3 className="pointer-card__name">
              {pointerEmployee
                ? `${pointerEmployee.firstName ?? ''} ${pointerEmployee.lastName ?? ''}`.trim()
                : '—'}
            </h3>
          </div>
          <WinnerList winners={displayedWinners} activeWinnerId={activeWinner?.id} />
        </div>
      </section>
    </div>
  )
}

export default App
