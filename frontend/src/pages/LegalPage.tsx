import { productConfig } from '../app/config'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'

const privacySections = [
  [
    'Current scope',
    'Phase 2 can read CSV and XLSX files locally in the browser. File contents are not intentionally transmitted to a Zynex server because no backend is connected.',
  ],
  [
    'Information handling',
    'Selected dataset contents, quality findings, analytical questions, and draft specifications are held in application memory for the current browser session. Reloading the page may clear them. Zynex does not intentionally collect account details in Phase 3.',
  ],
  [
    'Cookies and local storage',
    'Dataset contents are not stored in localStorage, sessionStorage, IndexedDB, cookies, analytics tools, or application logs. Hosting infrastructure may have separate operational practices that must be documented before deployment.',
  ],
  [
    'Future data processing',
    'If an API base URL is explicitly configured and a user requests a plan, the dataset reference, schema summary, quality summary, question, and specification may be sent to that configured service. Complete dataset rows are not included. Backend processing, retention, security controls, and subprocessors require review before production use.',
  ],
  ['Contact', '[Legal contact method required before production release.]'],
]

const termsSections = [
  [
    'Current scope',
    'Zynex supports local browser inspection of CSV and XLSX files and manual construction of an analysis specification. Analytical execution, verification, and report generation are not included in Phase 3.',
  ],
  [
    'Use of the service',
    'Data-quality findings are deterministic inspection aids, not guarantees that a dataset is correct or fit for a particular decision. No analytical answer engine is connected.',
  ],
  [
    'Availability',
    'The interface may change or be unavailable during development. No service level or availability commitment is made in this draft.',
  ],
  [
    'Intellectual property',
    '[Ownership and permitted-use terms require legal review before production release.]',
  ],
  [
    'Liability and governing terms',
    '[Liability limitations, governing law, and dispute terms require legal review before production release.]',
  ],
  ['Contact', '[Legal contact method required before production release.]'],
]

export function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  const isPrivacy = type === 'privacy'
  const title = isPrivacy ? 'Privacy Policy' : 'Terms and Conditions'
  const sections = isPrivacy ? privacySections : termsSections
  return (
    <article className="page-container legal-page">
      <PageHeader
        eyebrow="Draft policy"
        title={title}
        description={`Last updated: ${productConfig.legalLastUpdated}`}
      />
      <StatusMessage status="warning">
        This draft is pending final legal and deployment review and is not production-ready.
      </StatusMessage>
      <div className="legal-page__body">
        {sections.map(([heading, content]) => (
          <section key={heading}>
            <h2>{heading}</h2>
            <p>{content}</p>
          </section>
        ))}
      </div>
    </article>
  )
}
