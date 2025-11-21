import PropTypes from 'prop-types'
import './Wheel.css'

const palette = [
  '#1F6FEB',
  '#3A86FF',
  '#4CC9F0',
  '#00B894',
  '#FAD643',
  '#F17300',
  '#FF6B6B',
  '#E5383B',
  '#9C36B5',
  '#7C5EFB',
]

const Wheel = ({ employees, rotation, isSpinning, highlightedId }) => {
  if (!employees.length) {
    return (
      <div className="wheel-empty">
        <p>Add employees to start spinning.</p>
      </div>
    )
  }

  const size = 640
  const radius = size / 2 - 30
  const center = size / 2
  const sliceAngle = 360 / employees.length
  const avatarSize = employees.length > 160 ? 36 : employees.length > 120 ? 44 : employees.length > 80 ? 50 : 56
  const labelFontSize =
    employees.length > 160 ? '0.65rem' : employees.length > 120 ? '0.78rem' : employees.length > 80 ? '0.95rem' : '1.15rem'
  const normalizedRotation = ((rotation % 360) + 360) % 360

  const polarToCartesian = (angle, r = radius) => {
    const radians = ((angle - 90) * Math.PI) / 180
    return {
      x: center + r * Math.cos(radians),
      y: center + r * Math.sin(radians),
    }
  }

  const describeSlicePath = (startAngle, endAngle) => {
    const start = polarToCartesian(endAngle)
    const end = polarToCartesian(startAngle)
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1'
    return [
      'M',
      center,
      center,
      'L',
      start.x,
      start.y,
      'A',
      radius,
      radius,
      0,
      largeArcFlag,
      0,
      end.x,
      end.y,
      'Z',
    ].join(' ')
  }

  return (
    <div className="wheel-shell">
      <div className={`wheel ${isSpinning ? 'wheel--spinning' : ''}`} style={{ '--target-rotation': `${rotation}deg` }}>
        <div className="wheel__rim" aria-hidden="true" />
        <svg viewBox={`0 0 ${size} ${size}`}>
          <defs>
            <filter id="shadow">
              <feDropShadow dx="0" dy="3" stdDeviation="6" floodOpacity="0.25" />
            </filter>
          </defs>
          <g filter="url(#shadow)">
            {employees.map((employee, index) => {
              const startAngle = index * sliceAngle
              const endAngle = (index + 1) * sliceAngle
              const midAngle = startAngle + sliceAngle / 2
              const color = palette[index % palette.length]
              const isHighlighted = highlightedId === employee.id
              const isFlipped = midAngle > 90 && midAngle < 270
              const transformBase = `translate(${center}, ${center}) rotate(${midAngle})`
              const transform = isFlipped
                ? `${transformBase} scale(-1, 1) translate(0, -${radius * 0.72})`
                : `${transformBase} translate(0, -${radius * 0.72})`
              const label = employee.label || employee.firstName || '?'
              const initial = label.slice(0, 3).toUpperCase() || '?'
              const avatarPoint = polarToCartesian(midAngle, radius * 0.78)
              const pathClass = isHighlighted
                ? 'wheel-segment__path wheel-segment__path--glow'
                : employee.isBucket
                ? 'wheel-segment__path wheel-segment__path--bucket'
                : 'wheel-segment__path'

              return (
                <g key={employee.id} className="wheel-segment">
                  <path
                    d={describeSlicePath(startAngle, endAngle)}
                    fill={color}
                    className={pathClass}
                    title={employee.isBucket ? `${employee.bucketSize} names` : `${employee.firstName} ${employee.lastName || ''}`}
                  />
                  <foreignObject
                    x={avatarPoint.x - avatarSize / 2}
                    y={avatarPoint.y - avatarSize / 2}
                    width={avatarSize}
                    height={avatarSize}
                  >
                    <div className="wheel-avatar">
                      <div
                        className={employee.isBucket ? 'wheel-avatar__shape wheel-avatar__shape--bucket' : 'wheel-avatar__shape'}
                        style={{ transform: `rotate(${-normalizedRotation}deg)`, fontSize: labelFontSize }}
                      >
                        <span>{initial}</span>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </g>
        </svg>
        <div className="wheel__hub" aria-hidden="true">
          <div className="wheel__hub-inner">
            <strong>Wheel of</strong>
            <strong>Fortune</strong>
          </div>
        </div>
      </div>
      <div className="wheel-pointer">
        <div className="wheel-pointer__base" />
        <div className="wheel-pointer__arrow" />
      </div>
    </div>
  )
}

Wheel.propTypes = {
  employees: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      firstName: PropTypes.string.isRequired,
      lastName: PropTypes.string,
      avatar: PropTypes.string,
      label: PropTypes.string,
      isBucket: PropTypes.bool,
      bucketSize: PropTypes.number,
    }),
  ).isRequired,
  rotation: PropTypes.number.isRequired,
  isSpinning: PropTypes.bool,
  highlightedId: PropTypes.string,
}

export default Wheel
