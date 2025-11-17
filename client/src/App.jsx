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

  const startIdleMotion = useCallback(() => {
    if (idleIntervalRef.current || isSpinning) return
    idleIntervalRef.current = setInterval(() => {
      setRotation((prev) => prev + 0.35)
    }, 60)
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

  useEffect(() => {
    if (!winners.length || !employees.length) return
    if (winners[0].id === displayedWinnerId) return
    setDisplayedWinnerId(winners[0].id)
    spinToWinner(winners[0])
  }, [winners, displayedWinnerId, spinToWinner, employees.length])

useEffect(() => {
  return () => {
    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current)
    if (drawTimerRef.current) clearTimeout(drawTimerRef.current)
    if (idleResumeRef.current) clearTimeout(idleResumeRef.current)
    stopIdleMotion()
  }
}, [stopIdleMotion])

  const displayedWinners = useMemo(() => winners.slice(0, 3), [winners])

  const pointerEmployee = useMemo(() => {
    if (!employees.length) return null
    const normalizedRotation = ((rotation % 360) + 360) % 360
    const pointerAngle = (360 - normalizedRotation + 360) % 360
    const slice = 360 / employees.length
    const index = Math.floor(pointerAngle / slice) % employees.length
    return employees[index]
  }, [rotation, employees])

  if (loading) {
    return (
      <main className="app-shell">
        <p>Booting the wheel...</p>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Friday Fortune Wheel</h1>
        <Countdown target={config?.nextDrawAt} label="Next Draw" />
      </header>
      {error && <p className="status-text status-text--alert">⚠️ {error}</p>}

      <section className="content-grid">
        <div className="wheel-panel">
          <Wheel
            employees={employees}
            rotation={rotation}
            isSpinning={isSpinning}
            highlightedId={activeWinner?.employee?.id}
          />
        </div>

        <aside className="sidebar">
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
        </aside>
      </section>
    </div>
  )
}

export default App
