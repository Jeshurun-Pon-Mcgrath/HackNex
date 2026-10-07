import { ScanSearch } from 'lucide-react'
import { productConfig } from '../../app/config'

export function Brand() {
  return (
    <div className="brand" aria-label={productConfig.name}>
      <span className="brand__mark" aria-hidden="true">
        <ScanSearch size={21} />
      </span>
      <span>{productConfig.name}</span>
    </div>
  )
}
