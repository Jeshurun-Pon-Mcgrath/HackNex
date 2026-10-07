import { useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { api } from '../../api/client'
import { productPages } from '../../routes/navigation'
import { useWorkspaceStore } from '../../store/workspaceStore'
import { SkipLink } from '../ui/SkipLink'
import { Brand } from './Brand'
import { Footer } from './Footer'

export function AppShell() {
  const { workspaceId, summary, setSummary, forget } = useWorkspaceStore()
  useEffect(() => {
    if (workspaceId && !summary) api.getWorkspace(workspaceId).then(setSummary).catch(forget)
  }, [workspaceId, summary, setSummary, forget])

  return (
    <div className="app-shell">
      <SkipLink />
      <header className="topbar">
        <Brand />
        <nav aria-label="Primary navigation">
          <ol className="steps">
            {productPages.map(({ path, title }, i) => (
              <li key={path}>
                <NavLink
                  to={`/${path}`}
                  className={({ isActive }) =>
                    isActive ? 'nav-link nav-link--active' : 'nav-link'
                  }
                >
                  <span className="nav-link__step" aria-hidden="true">
                    {i + 1}
                  </span>
                  {title}
                </NavLink>
              </li>
            ))}
          </ol>
        </nav>
        {summary && (
          <p className="topbar__status">
            {summary.files.length} files, {summary.findings.length} traps
          </p>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
