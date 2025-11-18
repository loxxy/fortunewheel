import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Wheel from './components/Wheel'
import WinnerList from './components/WinnerList'
import Countdown from './components/Countdown'
import confetti from 'canvas-confetti'

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
const SPIN_DURATION_MS = 5200

const App = () => {
  const [employees, setEmployees] = useState([])
  const [winners, setWinners] = useState([])
  const [visibleWinners, setVisibleWinners] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayedWinnerId, setDisplayedWinnerId] = useState(null)
  const [activeWinner, setActiveWinner] = useState(null)
  const [isCelebrating, setIsCelebrating] = useState(false)
  const [celebrationWinner, setCelebrationWinner] = useState(null)
  const [isPreReveal, setIsPreReveal] = useState(false)
  const spinTimeoutRef = useRef(null)
  const drawTimerRef = useRef(null)
  const idleIntervalRef = useRef(null)
  const idleResumeRef = useRef(null)
  const audioCtxRef = useRef(null)
  const lastTickTimeRef = useRef(0)
  const lastPointerIndexRef = useRef(null)
  const employeesCountRef = useRef(0)
  const celebrationTimeoutRef = useRef(null)
  const rotationRef = useRef(0)
  const spinAnimationFrameRef = useRef(null)
  const pendingWinnersRef = useRef(null)

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

  const fireConfetti = useCallback(() => {
    const defaults = { spread: 70, ticks: 50, gravity: 0.9, decay: 0.9, startVelocity: 45 }
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 1.1,
      origin: { y: 0.6 },
    })
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 0.9,
      origin: { y: 0.3 },
      angle: 120,
      startVelocity: 55,
    })
    confetti({
      ...defaults,
      particleCount: 80,
      scalar: 0.9,
      origin: { y: 0.3 },
      angle: 60,
      startVelocity: 55,
    })
  }, [])

  const playCelebrationChime = useCallback(() => {
    const ctx = getAudioContext()
    if (!ctx) return
    const base = ctx.currentTime
    const notes = [784, 659, 523]
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = base + idx * 0.1
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.4, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.7)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.8)
    })
  }, [getAudioContext])

  const triggerCelebration = useCallback(
    (winner) => {
      if (!winner?.employee) return
      setCelebrationWinner(winner.employee)
      setIsCelebrating(true)
      fireConfetti()
      playCelebrationChime()
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current)
      }
      celebrationTimeoutRef.current = setTimeout(() => {
        setIsCelebrating(false)
        setCelebrationWinner(null)
        setIsPreReveal(false)
      }, 4500)
    },
    [fireConfetti, playCelebrationChime],
  )

  const animateRotation = useCallback((from, to, duration = SPIN_DURATION_MS) => {
    if (spinAnimationFrameRef.current) {
      cancelAnimationFrame(spinAnimationFrameRef.current)
    }
    const start = performance.now()
    const totalDelta = to - from

    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = from + totalDelta * eased
      setRotation(value)
      if (progress < 1) {
        spinAnimationFrameRef.current = requestAnimationFrame(step)
      } else {
        spinAnimationFrameRef.current = null
      }
    }

    spinAnimationFrameRef.current = requestAnimationFrame(step)
  }, [])

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
      const fromRotation = rotationRef.current
      const toRotation = fromRotation + rotations * 360 + (360 - targetAngle) + randomJitter
      animateRotation(fromRotation, toRotation, SPIN_DURATION_MS)
      spinTimeoutRef.current = setTimeout(() => {
        setIsSpinning(false)
        triggerCelebration(winner)
        idleResumeRef.current = setTimeout(() => {
          startIdleMotion()
        }, 8000)
      }, SPIN_DURATION_MS)
    },
    [employees, startIdleMotion, stopIdleMotion, triggerCelebration, animateRotation],
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
    const delay = Math.max(target - Date.now(), 0)
    drawTimerRef.current = setTimeout(() => {
      setIsPreReveal(true)
      fetchWinners()
      fetchConfig()
      setTimeout(fetchWinners, 2000)
    }, delay)
    return () => {
      if (drawTimerRef.current) {
        clearTimeout(drawTimerRef.current)
      }
    }
  }, [config, fetchWinners, fetchConfig])

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
    const latestWinner = winners[0]
    if (!displayedWinnerId) {
      setDisplayedWinnerId(latestWinner.id)
      setActiveWinner((prev) => prev ?? latestWinner)
      setVisibleWinners(winners.slice(0, 3))
      return
    }

    if (latestWinner.id === displayedWinnerId) {
      pendingWinnersRef.current = winners.slice(0, 3)
      return
    }

    pendingWinnersRef.current = winners.slice(0, 3)
    setDisplayedWinnerId(latestWinner.id)
    spinToWinner(latestWinner)
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
    rotationRef.current = rotation
  }, [rotation])

useEffect(() => {
  if (!isSpinning && !isCelebrating && !isPreReveal && pendingWinnersRef.current) {
    setVisibleWinners(pendingWinnersRef.current)
    pendingWinnersRef.current = null
  } else if (!pendingWinnersRef.current && !visibleWinners.length && winners.length) {
    setVisibleWinners(winners.slice(0, 3))
  }
}, [isSpinning, isCelebrating, isPreReveal, winners, visibleWinners.length])

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
      if (drawTimerRef.current) clearTimeout(drawTimerRef.current)
      if (idleResumeRef.current) clearTimeout(idleResumeRef.current)
      if (spinAnimationFrameRef.current) cancelAnimationFrame(spinAnimationFrameRef.current)
      if (celebrationTimeoutRef.current) clearTimeout(celebrationTimeoutRef.current)
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
      {isCelebrating && (
        <div className="celebration-overlay">
          <div className="celebration-card">
            <p>And the winner is…</p>
            <h1>
              {celebrationWinner
                ? `${celebrationWinner.firstName} ${celebrationWinner.lastName ?? ''}`.trim()
                : '—'}
            </h1>
          </div>
        </div>
      )}
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
          {isPreReveal ? (
            <div className="info-card info-card--waiting">
              <p className="info-card__label">Stand by</p>
              <h3>Picking a winner…</h3>
            </div>
          ) : (
            <>
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
              <WinnerList winners={visibleWinners} activeWinnerId={activeWinner?.id} />
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export default App
