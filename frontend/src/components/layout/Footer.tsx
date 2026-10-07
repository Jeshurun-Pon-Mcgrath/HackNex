import { Link } from 'react-router-dom'
import { productConfig } from '../../app/config'

export function Footer() {
  return (
    <footer className="footer">
      <span>{productConfig.name}</span>
      <nav aria-label="Legal">
        <Link to="/privacy">Privacy Policy</Link>
        <Link to="/terms">Terms and Conditions</Link>
      </nav>
      <span>© {new Date().getFullYear()}</span>
    </footer>
  )
}
