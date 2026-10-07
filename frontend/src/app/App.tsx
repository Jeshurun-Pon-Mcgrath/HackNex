import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { LegalPage } from '../pages/LegalPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { ProductPage } from '../pages/ProductPage'
import { DataQualityPage } from '../pages/DataQualityPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import { AnalysisPage } from '../pages/AnalysisPage'
import { productPages } from '../routes/navigation'

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/workspace" replace />} />
        <Route path="workspace" element={<WorkspacePage />} />
        <Route path="data-quality" element={<DataQualityPage />} />
        <Route path="analysis" element={<AnalysisPage />} />
        {productPages
          .filter(({ path }) => !['workspace', 'data-quality', 'analysis'].includes(path))
          .map((page) => (
            <Route key={page.path} path={page.path} element={<ProductPage page={page} />} />
          ))}
        <Route path="privacy" element={<LegalPage type="privacy" />} />
        <Route path="terms" element={<LegalPage type="terms" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
