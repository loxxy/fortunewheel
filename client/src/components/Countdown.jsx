import { useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import './Countdown.css'

const calculateParts = (target) => {
  if (!target) {
    return { label: '—', isComplete: true }
  }
  const targetTime = new Date(target).getTime()
  const now = Date.now()
  const diff = targetTime - now
  if (Number.isNaN(targetTime)) {
    return { label: '—', isComplete: true }
  }
  if (diff <= 0) {
    return { label: '00:00:00', isComplete: true }
  }
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff / (1000 * 60)) % 60)
  const seconds = Math.floor((diff / 1000) % 60)
  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  const label = `${days > 0 ? `${days}d ` : ''}${String(remainingHours).padStart(2, '0')}:${String(
    minutes,
  ).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return { label, isComplete: false }
}

const Countdown = ({ target, label }) => {
  const [display, setDisplay] = useState(calculateParts(target))

  useEffect(() => {
    setDisplay(calculateParts(target))
    const id = setInterval(() => {
      setDisplay(calculateParts(target))
    }, 1000)
    return () => clearInterval(id)
  }, [target])

  const formattedDate = useMemo(() => {
    if (!target) return 'No schedule'
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(target))
  }, [target])

  return (
    <div className="countdown">
      <div className="countdown__label">{label}</div>
      <div className="countdown__value">{display.label}</div>
      <div className="countdown__hint">{formattedDate}</div>
    </div>
  )
}

Countdown.propTypes = {
  target: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
  label: PropTypes.string,
}

export default Countdown
