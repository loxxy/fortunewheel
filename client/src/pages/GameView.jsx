import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import confetti from 'canvas-confetti'
import Wheel from '../components/Wheel'
import WinnerList from '../components/WinnerList'
import Countdown from '../components/Countdown'

const IDLE_INTERVAL_MS = 60
const SPIN_DURATION_MS = 5200
const MAX_WHEEL_SLICES = 120
const MAX_BUCKETS = 80
const WINNER_DISPLAY_COUNT = 10

const shuffleEmployees = (list) => {
  if (!Array.isArray(list)) return []
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const buildBuckets = (list) => {
  if (!Array.isArray(list) || !list.length) return []
  const chunkSize = Math.max(1, Math.ceil(list.length / MAX_BUCKETS))
  const buckets = []
  for (let i = 0; i < list.length; i += chunkSize) {
    const members = list.slice(i, i + chunkSize)
    const startIndex = i + 1
    const endIndex = Math.min(list.length, i + members.length)
    const label = members.length === 1 ? members[0].firstName : `#${startIndex}–${endIndex}`
    const bucketId = `bucket-${startIndex}-${endIndex}`
    buckets.push({
      id: bucketId,
      firstName: label,
      lastName: members.length > 1 ? `${members.length} names` : members[0].lastName,
      label,
      bucketSize: members.length,
      members,
      isBucket: members.length > 1,
    })
  }
  return buckets
}

const GameView = () => {
  const { slug = 'default' } = useParams()
  const gameSlug = slug.toLowerCase()
  const API_BASE = import.meta.env.VITE_API_URL ?? ''
  const { rosterUrl, isKioskMode } = useMemo(() => {
    if (typeof window === 'undefined') {
      return { rosterUrl: '', isKioskMode: false }
    }
    const origin = window.location.origin.replace(/\/$/, '')
    const { pathname, search } = window.location
    const params = new URLSearchParams(search)
    const isKiosk = params.get('mode') === 'kiosk'
    if (isKiosk) {
      params.delete('mode')
    }
    const query = params.toString()
    const pathWithQuery = query ? `${pathname}?${query}` : pathname
    return { rosterUrl: `${origin}${pathWithQuery || '/'}`, isKioskMode: isKiosk }
  }, [])

  const [employees, setEmployees] = useState([])
  const [wheelEmployees, setWheelEmployees] = useState([])
  const [winners, setWinners] = useState([])
  const [visibleWinners, setVisibleWinners] = useState([])
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayedWinnerId, setDisplayedWinnerId] = useState(null)
  const [activeWinner, setActiveWinner] = useState(null)
  const [isCelebrating, setIsCelebrating] = useState(false)
  const [celebrationWinner, setCelebrationWinner] = useState(null)
  const [isPreReveal, setIsPreReveal] = useState(false)
  const [activeBucketId, setActiveBucketId] = useState(null)
  const [isRosterOpen, setIsRosterOpen] = useState(false)

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

  const request = useCallback(
    async (path, options = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
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
    [API_BASE],
  )

  const fetchEmployees = useCallback(async () => {
    const result = await request(`/api/${gameSlug}/employees`)
    setEmployees(result.employees ?? [])
  }, [request, gameSlug])

  const fetchWinners = useCallback(async () => {
    const result = await request(`/api/${gameSlug}/winners?limit=${WINNER_DISPLAY_COUNT}`)
    setWinners(result.winners ?? [])
  }, [request, gameSlug])

  const fetchConfig = useCallback(async () => {
    const result = await request(`/api/${gameSlug}/config`)
    setConfig(result)
  }, [request, gameSlug])

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

  const reshuffleWheel = useCallback(() => {
    setWheelEmployees((prev) => {
      if (!employees.length) return prev
      const usingBuckets = employees.length > MAX_WHEEL_SLICES
      const source = usingBuckets ? buildBuckets(employees) : employees
      return shuffleEmployees(source)
    })
  }, [employees])

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
        reshuffleWheel()
      }, 4500)
    },
    [fireConfetti, playCelebrationChime, reshuffleWheel],
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

  const useBucketedWheel = employees.length > MAX_WHEEL_SLICES
  const bucketedEmployees = useMemo(
    () => (useBucketedWheel ? buildBuckets(employees) : []),
    [useBucketedWheel, employees],
  )

  const wheelData = useBucketedWheel
    ? bucketedEmployees
    : wheelEmployees.length
    ? wheelEmployees
    : employees

  const pointerInfo = useMemo(() => {
    if (!wheelData.length) return { employee: null, index: null }
    const normalizedRotation = ((rotation % 360) + 360) % 360
    const pointerAngle = (360 - normalizedRotation + 360) % 360
    const slice = 360 / wheelData.length
    const index = Math.floor(pointerAngle / slice) % wheelData.length
    return { employee: wheelData[index], index }
  }, [rotation, wheelData])
  const pointerEmployee = pointerInfo.employee

  const pointerDisplay = useMemo(() => {
    if (!pointerEmployee) {
      return { name: '—', initial: '?' }
    }
    if (pointerEmployee.isBucket && pointerEmployee.members?.length) {
      const randomIndex = Math.floor(Math.random() * pointerEmployee.members.length)
      const primary = pointerEmployee.members[randomIndex] || pointerEmployee.members[0]
      const baseName = `${primary.firstName ?? ''} ${primary.lastName ?? ''}`.trim() || '—'
      return {
        name: baseName,
        initial: primary.firstName?.[0]?.toUpperCase() ?? '?',
      }
    }
    const name = `${pointerEmployee.firstName ?? ''} ${pointerEmployee.lastName ?? ''}`.trim() || '—'
    return { name, initial: pointerEmployee.firstName?.[0]?.toUpperCase() ?? '?' }
  }, [pointerEmployee])

  const spinToWinner = useCallback(
    (winner) => {
      const currentWheel = useBucketedWheel ? bucketedEmployees : wheelData.length ? wheelData : employees
      if (!winner?.employee || !currentWheel.length) return
      const targetId = winner.employee.id
      const index = useBucketedWheel
        ? currentWheel.findIndex((bucket) => bucket.members?.some((member) => member.id === targetId))
        : currentWheel.findIndex((emp) => emp.id === targetId)
      if (index === -1) return
      if (spinTimeoutRef.current) {
        clearTimeout(spinTimeoutRef.current)
      }
      if (idleResumeRef.current) {
        clearTimeout(idleResumeRef.current)
      }
      stopIdleMotion()
      const sliceAngle = 360 / currentWheel.length
      const randomJitter = (Math.random() - 0.5) * sliceAngle * 0.4
      const targetAngle = index * sliceAngle + sliceAngle / 2
      const rotations = 4 + Math.floor(Math.random() * 3)
      setIsSpinning(true)
      const bucketId = useBucketedWheel ? currentWheel[index]?.id || null : null
      setActiveWinner(bucketId ? { ...winner, bucketId } : winner)
      setActiveBucketId(bucketId)
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
    [
      wheelData,
      employees,
      useBucketedWheel,
      bucketedEmployees,
      stopIdleMotion,
      animateRotation,
      triggerCelebration,
      startIdleMotion,
    ],
  )

  useEffect(() => {
    setLoading(true)
    setError('')
    setNotFound(false)
    setEmployees([])
    setWheelEmployees([])
    setWinners([])
    setVisibleWinners([])
    setDisplayedWinnerId(null)
    setActiveWinner(null)
    setActiveBucketId(null)
    setIsPreReveal(false)
    pendingWinnersRef.current = null
  }, [gameSlug])

  useEffect(() => {
    startIdleMotion()
    ;(async () => {
      try {
        setError(null)
        await Promise.all([fetchEmployees(), fetchWinners(), fetchConfig()])
      } catch (err) {
        setError(err.message)
        if ((err.message || '').toLowerCase().includes('game not found')) {
          setNotFound(true)
        }
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      stopIdleMotion()
    }
  }, [fetchEmployees, fetchWinners, fetchConfig, startIdleMotion, stopIdleMotion, gameSlug])

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

  useEffect(() => {
    if (!winners.length || !employees.length) return
    const latestWinner = winners[0]
    if (!displayedWinnerId) {
      if (isPreReveal) {
        pendingWinnersRef.current = winners.slice(0, WINNER_DISPLAY_COUNT)
        setDisplayedWinnerId(latestWinner.id)
        spinToWinner(latestWinner)
      } else {
        setDisplayedWinnerId(latestWinner.id)
        setActiveWinner((prev) => prev ?? latestWinner)
        setVisibleWinners(winners.slice(0, WINNER_DISPLAY_COUNT))
      }
      return
    }

    if (latestWinner.id === displayedWinnerId) {
      pendingWinnersRef.current = winners.slice(0, WINNER_DISPLAY_COUNT)
      return
    }

    pendingWinnersRef.current = winners.slice(0, WINNER_DISPLAY_COUNT)
    setDisplayedWinnerId(latestWinner.id)
    spinToWinner(latestWinner)
  }, [winners, displayedWinnerId, spinToWinner, employees.length, isPreReveal])

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
    employeesCountRef.current = wheelData.length
  }, [wheelData.length])

  useEffect(() => {
    rotationRef.current = rotation
  }, [rotation])

  useEffect(() => {
    if (!useBucketedWheel && activeBucketId) {
      setActiveBucketId(null)
    }
  }, [useBucketedWheel, activeBucketId])

  useEffect(() => {
    if (!isSpinning && !isCelebrating && !isPreReveal && pendingWinnersRef.current) {
      setVisibleWinners(pendingWinnersRef.current)
      pendingWinnersRef.current = null
    } else if (!pendingWinnersRef.current && !visibleWinners.length && winners.length) {
      setVisibleWinners(winners.slice(0, WINNER_DISPLAY_COUNT))
    }
  }, [isSpinning, isCelebrating, isPreReveal, visibleWinners.length, winners])

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

  if (notFound) {
    return (
      <main className="app-shell">
        <p className="status-text status-text--alert">
          ⚠️ Game “{gameSlug}” was not found. Double-check the URL or create it in the admin panel.
        </p>
      </main>
    )
  }

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
      {isRosterOpen && (
        <div className="roster-modal" role="dialog" aria-modal="true">
          <div className="roster-modal__card">
            <div className="roster-modal__header">
              <h3>Roster ({employees.length})</h3>
              <button type="button" className="roster-modal__close" onClick={() => setIsRosterOpen(false)}>
                ×
              </button>
            </div>
            <div className="roster-modal__list">
              {employees.length ? (
                employees.map((emp) => (
                  <div key={emp.id} className="roster-modal__row">
                    <span className="roster-modal__initial">{emp.firstName?.[0] ?? '?'}</span>
                    <span className="roster-modal__name">
                      {`${emp.firstName ?? ''} ${emp.lastName ?? ''}`.trim()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="roster-modal__empty">No employees yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
      {error && <p className="status-text status-text--alert">⚠️ {error}</p>}
      <section className="main-grid">
        <div className="wheel-panel">
          <Wheel
            employees={wheelData}
            rotation={rotation}
            isSpinning={isSpinning}
            highlightedId={useBucketedWheel ? activeBucketId || activeWinner?.bucketId : activeWinner?.employee?.id}
          />
          <div className="roster-fab-wrap">
            {!isKioskMode && (
              <button type="button" className="roster-fab" onClick={() => setIsRosterOpen(true)}>
                Roster ({employees.length})
              </button>
            )}
            {isKioskMode && rosterUrl ? (
              <div className="roster-qr">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(rosterUrl)}`}
                  alt="Open game URL"
                />
              </div>
            ) : null}
          </div>
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
                <p className="info-card__label">Next Draw In</p>
                <Countdown target={config?.nextDrawAt} />
              </div>
              <div className="pointer-card">
                <div className="pointer-card__avatar">
                  <span>{pointerDisplay.initial}</span>
                </div>
                <h3 className="pointer-card__name">
                  {pointerDisplay.name}
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

export default GameView
