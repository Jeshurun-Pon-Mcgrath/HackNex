import { NavLink } from 'react-router-dom'
import { productPages } from '../../routes/navigation'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary navigation" className="primary-nav">
      <p className="primary-nav__label">Workspace</p>
      <ul>
        {productPages.map(({ path, title, icon: Icon }) => (
          <li key={path}>
            <NavLink
              to={`/${path}`}
              onClick={onNavigate}
              className={({ isActive }) => (isActive ? 'nav-link nav-link--active' : 'nav-link')}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{title}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
