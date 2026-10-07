import { Link } from 'react-router-dom'
import { productConfig } from '../../app/config'

export function Brand() {
  return (
    <Link className="brand" to="/workspace">
      <svg className="brand__mark" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.6 2.6L16 9.5" />
      </svg>
      {productConfig.name}
    </Link>
  )
}
