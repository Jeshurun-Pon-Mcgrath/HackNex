import { productConfig } from '../app/config'
import { PageHeader } from '../components/ui/PageHeader'
import { StatusMessage } from '../components/ui/StatusMessage'

const privacySections = [
  [
    'Current scope',
    'Zynex sends the files you add to the Zynex backend you run (by default on this machine). Questions, table schemas, sample values and document text are sent to the configured language model, which by default is a local Ollama model; nothing is sent to a cloud service unless you configure one.',
  ],
  [
    'Information handling',
    'Uploaded files, generated proof scripts and run records are stored in the backend data folder until you delete them. Proof scripts are executed on the backend in an isolated subprocess against a temporary copy of your files.',
  ],
  [
    'Cookies and local storage',
    'The browser remembers only the current workspace identifier in localStorage so the workspace survives a reload. Dataset contents are not stored in the browser.',
  ],
  ['Contact', '[Legal contact method required before production release.]'],
]

const termsSections = [
  [
    'Current scope',
    'Zynex answers questions about uploaded tables with generated, re-runnable proof scripts, or declines to answer when the data cannot support a reliable result.',
  ],
  [
    'Use of the service',
    'Answers are only as reliable as the data, documents and stated assumptions behind them. Review the assumptions and proof before relying on it for a decision.',
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
      <PageHeader title={title} description={`Last updated: ${productConfig.legalLastUpdated}`} />
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
