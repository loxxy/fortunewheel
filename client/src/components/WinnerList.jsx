import PropTypes from 'prop-types'
import './WinnerList.css'

const formatDisplayDate = (iso) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso))

const WinnerList = ({ winners, headline, activeWinnerId }) => (
  <div className="winner-panel">
    <div className="winner-panel__header">
      <h3>{headline ?? 'Recent Winners'}</h3>
      <span className="winner-panel__count">{winners.length}</span>
    </div>
    <ul className="winner-list">
      {winners.length ? (
        winners.map((winner, index) => (
          <li key={winner.id} className="winner-list__item">
            <div className="winner-list__avatar">
              {winner.employee?.avatar ? (
                <img src={winner.employee.avatar} alt={winner.employee.firstName} />
              ) : (
                <span>{winner.employee?.firstName.slice(0, 1)}</span>
              )}
            </div>
            <div>
              <div className="winner-list__row">
                <p className="winner-list__name">
                  {winner.employee
                    ? `${winner.employee.firstName} ${winner.employee.lastName}`
                    : 'Employee removed'}
                </p>
                {(index === 0 || winner.id === activeWinnerId) && (
                  <span className="winner-list__badge">{index === 0 ? 'Current' : 'Latest'}</span>
                )}
              </div>
              <p className="winner-list__meta">
                {winner.trigger === 'manual' ? 'Manual spin' : 'Scheduled draw'} ·{' '}
                {formatDisplayDate(winner.drawnAt)}
              </p>
            </div>
          </li>
        ))
      ) : (
        <li className="winner-list__empty">No winners yet.</li>
      )}
    </ul>
  </div>
)

WinnerList.propTypes = {
  winners: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      drawnAt: PropTypes.string.isRequired,
      trigger: PropTypes.string.isRequired,
      employee: PropTypes.shape({
        firstName: PropTypes.string,
        lastName: PropTypes.string,
        avatar: PropTypes.string,
      }),
    }),
  ).isRequired,
  headline: PropTypes.string,
  activeWinnerId: PropTypes.string,
}

export default WinnerList
