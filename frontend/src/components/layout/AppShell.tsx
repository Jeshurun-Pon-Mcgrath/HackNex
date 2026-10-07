import { Menu } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { productPages } from '../../routes/navigation'
import { IconButton } from '../ui/IconButton'
import { SkipLink } from '../ui/SkipLink'
import { Brand } from './Brand'
import { Footer } from './Footer'
import { MobileNavigation } from './MobileNavigation'
import { Sidebar } from './Sidebar'

function getPageTitle(pathname: string) {
  const productPage = productPages.find(({ path }) => pathname === `/${path}`)
  if (productPage) return productPage.title
  if (pathname === '/privacy') return 'Privacy Policy'
  if (pathname === '/terms') return 'Terms and Conditions'
  return 'Page not found'
}

export function AppShell() {
  const { pathname } = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), [])

  return (
    <div className="app-shell">
      <SkipLink />
      <aside className="sidebar">
        <div className="sidebar__brand">
          <Brand />
        </div>
        <Sidebar />
      </aside>
      <div className="app-shell__content">
        <header className="topbar">
          <IconButton
            label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
            ref={menuButtonRef}
          >
            <Menu size={21} />
          </IconButton>
          <h2>{getPageTitle(pathname)}</h2>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <Footer />
      </div>
      <MobileNavigation open={mobileNavOpen} onClose={closeMobileNav} triggerRef={menuButtonRef} />
    </div>
  )
}
