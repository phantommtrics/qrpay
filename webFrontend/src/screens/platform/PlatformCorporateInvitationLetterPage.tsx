import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Send } from 'lucide-react'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  ApiError,
  previewCorporateInvitationLetter,
  sendCorporateInvitationLetter,
  type CorporateInvitationLetterPayload,
} from '../../services/subscriptionApi'
import { isPlatformOperator } from '../../utils/platformOperator'

type FormState = {
  templateMode: 'default' | 'manual'
  organizationName: string
  contactName: string
  contactTitle: string
  toEmail: string
  ccEmailsText: string
  senderName: string
  senderTitle: string
  proposalReference: string
  monthlyFeeLabel: string
  onboardingTimeline: string
  nextStep: string
  subject: string
  personalNote: string
  manualTemplateContent: string
}

const VARIABLE_TOKENS = [
  '{{today}}',
  '{{platformName}}',
  '{{platformUrl}}',
  '{{organizationName}}',
  '{{contactName}}',
  '{{contactFirstName}}',
  '{{contactTitle}}',
  '{{recipientEmail}}',
  '{{ccEmails}}',
  '{{senderName}}',
  '{{senderTitle}}',
  '{{senderEmail}}',
  '{{replyToEmail}}',
  '{{proposalReference}}',
  '{{monthlyFeeLabel}}',
  '{{onboardingTimeline}}',
  '{{nextStep}}',
] as const

const DEFAULT_MANUAL_TEMPLATE = `{{today}}

{{contactName}}
{{contactTitle}}
{{organizationName}}

Dear {{contactFirstName}},

We are pleased to introduce {{platformName}} to {{organizationName}}.

{{platformName}} can help your team manage cash, journal bookkeeping, wallet collections through Wave, APS, and Yonna, and finance reports including profit and loss, account statements, and balance sheets.

Commercial note: {{monthlyFeeLabel}}
Onboarding timeline: {{onboardingTimeline}}

Platform URL: {{platformUrl}}
Sender email: {{senderEmail}}
Replies: {{replyToEmail}}

Recommended next step: {{nextStep}}

Kind regards,
{{senderName}}
{{senderTitle}}`

const DEFAULT_FORM: FormState = {
  templateMode: 'default',
  organizationName: '',
  contactName: '',
  contactTitle: 'Managing Director',
  toEmail: '',
  ccEmailsText: '',
  senderName: '',
  senderTitle: 'DirectPay Platform Operations',
  proposalReference: 'DirectPay Corporate Proposal',
  monthlyFeeLabel: 'a tailored corporate subscription based on selected modules and users',
  onboardingTimeline: '5 to 10 business days after account setup and wallet readiness checks',
  nextStep:
    'A short discovery meeting to confirm payment channels, approval workflow, reporting needs, and onboarding schedule.',
  subject: '',
  personalNote: '',
  manualTemplateContent: DEFAULT_MANUAL_TEMPLATE,
}

function splitEmails(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function emptyToNull(value: string) {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function buildPayload(form: FormState): CorporateInvitationLetterPayload {
  return {
    templateMode: form.templateMode,
    organizationName: form.organizationName.trim(),
    contactName: form.contactName.trim(),
    contactTitle: emptyToNull(form.contactTitle),
    toEmail: form.toEmail.trim(),
    ccEmails: splitEmails(form.ccEmailsText),
    senderName: form.senderName.trim(),
    senderTitle: emptyToNull(form.senderTitle),
    proposalReference: emptyToNull(form.proposalReference),
    monthlyFeeLabel: emptyToNull(form.monthlyFeeLabel),
    onboardingTimeline: emptyToNull(form.onboardingTimeline),
    nextStep: emptyToNull(form.nextStep),
    subject: emptyToNull(form.subject),
    personalNote: emptyToNull(form.personalNote),
    manualTemplateContent: form.templateMode === 'manual' ? emptyToNull(form.manualTemplateContent) : null,
  }
}

function validate(form: FormState) {
  if (form.organizationName.trim().length < 2) return 'Enter the organization name.'
  if (form.contactName.trim().length < 2) return 'Enter the contact name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.toEmail.trim())) return 'Enter a valid primary email.'
  if (splitEmails(form.ccEmailsText).some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return 'One or more CC emails are invalid.'
  }
  if (form.senderName.trim().length < 2) return 'Enter the sender name.'
  if (form.templateMode === 'manual' && form.manualTemplateContent.trim().length < 10) {
    return 'Enter manual template content.'
  }
  return null
}

export function PlatformCorporateInvitationLetterPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    senderName: user?.name ?? '',
  }))
  const [preview, setPreview] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const payload = useMemo(() => buildPayload(form), [form])

  const loadPreview = useCallback(async () => {
    const validationError = validate(form)
    if (validationError) {
      setPreview('')
      return
    }
    setPreviewLoading(true)
    try {
      const data = await previewCorporateInvitationLetter(payload)
      setPreview(data.letterText)
    } catch (e) {
      setPreview('')
      setError(e instanceof ApiError ? e.message : 'Could not generate the invitation preview.')
    } finally {
      setPreviewLoading(false)
    }
  }, [form, payload])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadPreview()
    }, 350)
    return () => window.clearTimeout(id)
  }, [loadPreview])

  useEffect(() => {
    if (!form.senderName.trim() && user?.name) {
      setForm((prev) => ({ ...prev, senderName: user.name }))
    }
  }, [form.senderName, user?.name])

  const update = <K extends keyof FormState>(key: K) => (value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
    setSuccess(null)
  }

  const submit = async () => {
    const validationError = validate(form)
    if (validationError) {
      setError(validationError)
      return
    }
    setSending(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await sendCorporateInvitationLetter(payload)
      setSuccess(`Invitation sent with ${result.attachmentFilename}.`)
      navigate(APP_PATHS.platformCorporateInvitationRecords)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the invitation letter.')
    } finally {
      setSending(false)
    }
  }

  if (!isPlatformOperator(user)) {
    return null
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Platform</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Business invitation letter</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Prepare a professional DirectPay proposal letter for a target corporate or small business. The email
          carries a short introduction and attaches the branded PDF letter.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <PageCard className="p-6">
          <div className="mb-5 flex items-center gap-2">
            <FileText className="h-5 w-5 text-teal-600" />
            <h2 className="text-lg font-semibold text-slate-900">Proposal variables</h2>
          </div>
          <div className="mb-5 rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Letter template</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <TemplateOption
                title="Default professional letter"
                description="Use the built-in DirectPay business proposal wording."
                selected={form.templateMode === 'default'}
                onClick={() => update('templateMode')('default')}
              />
              <TemplateOption
                title="Manual content"
                description="Write your own letter using variables from this form."
                selected={form.templateMode === 'manual'}
                onClick={() => update('templateMode')('manual')}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Organization name"
              value={form.organizationName}
              onChange={update('organizationName')}
              placeholder="e.g. Kotu Trading Group"
            />
            <TextField
              label="Contact name"
              value={form.contactName}
              onChange={update('contactName')}
              placeholder="e.g. Fatou Njie"
            />
            <TextField
              label="Contact title"
              value={form.contactTitle}
              onChange={update('contactTitle')}
              placeholder="e.g. Finance Director"
            />
            <TextField
              label="Primary recipient email"
              type="email"
              value={form.toEmail}
              onChange={update('toEmail')}
              placeholder="name@company.gm"
            />
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-slate-600">CC emails</span>
              <textarea
                value={form.ccEmailsText}
                onChange={(e) => update('ccEmailsText')(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Separate multiple emails with commas or new lines"
              />
            </label>
            <TextField
              label="Sender name"
              value={form.senderName}
              onChange={update('senderName')}
              placeholder="Your name"
            />
            <TextField
              label="Sender title"
              value={form.senderTitle}
              onChange={update('senderTitle')}
              placeholder="DirectPay Platform Operations"
            />
            <TextField
              label="Proposal reference"
              value={form.proposalReference}
              onChange={update('proposalReference')}
              placeholder="DirectPay Corporate Proposal"
            />
            <TextField
              label="Commercial note"
              value={form.monthlyFeeLabel}
              onChange={update('monthlyFeeLabel')}
              placeholder="Custom corporate pricing..."
            />
            <TextField
              label="Onboarding timeline"
              value={form.onboardingTimeline}
              onChange={update('onboardingTimeline')}
              placeholder="5 to 10 business days..."
            />
            <TextField
              label="Email subject"
              value={form.subject}
              onChange={update('subject')}
              placeholder="Defaults to DirectPay proposal for organization"
            />
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-slate-600">Recommended next step</span>
              <textarea
                value={form.nextStep}
                onChange={(e) => update('nextStep')(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="text-xs font-medium text-slate-600">Optional email intro note</span>
              <textarea
                value={form.personalNote}
                onChange={(e) => update('personalNote')(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                placeholder="Add a short personal note above the standard email introduction"
              />
            </label>
            {form.templateMode === 'manual' ? (
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Manual letter content</span>
                <textarea
                  value={form.manualTemplateContent}
                  onChange={(e) => update('manualTemplateContent')(e.target.value)}
                  rows={14}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  placeholder="Write the PDF letter content here. Use variables like {{organizationName}}."
                />
                <span className="mt-2 block text-xs text-slate-500">
                  Click a variable to append it to the manual template:
                </span>
                <span className="mt-2 flex flex-wrap gap-2">
                  {VARIABLE_TOKENS.map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() =>
                        update('manualTemplateContent')(
                          `${form.manualTemplateContent}${form.manualTemplateContent.endsWith(' ') || form.manualTemplateContent.endsWith('\n') ? '' : ' '}${token}`,
                        )
                      }
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-teal-300 hover:text-teal-700"
                    >
                      {token}
                    </button>
                  ))}
                </span>
              </label>
            ) : null}
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              The PDF includes the DirectPay logo and uses the selected letter template with the variables
              above rendered into the final content.
            </p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={sending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {sending ? 'Sending…' : 'Send email with PDF'}
            </button>
          </div>
        </PageCard>

        <PageCard className="overflow-hidden p-0">
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
            <p className="text-sm font-semibold text-slate-900">
              {form.templateMode === 'manual' ? 'Manual letter preview' : 'Default letter preview'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              This is the same professional letter content rendered into the PDF attachment.
            </p>
          </div>
          <div className="max-h-[760px] overflow-auto p-5">
            {previewLoading ? (
              <p className="text-sm text-slate-500">Generating preview…</p>
            ) : preview ? (
              <pre className="whitespace-pre-wrap rounded-2xl bg-white text-sm leading-6 text-slate-700">
                {preview}
              </pre>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                Fill in the organization, contact, recipient email, and sender name to preview the letter.
              </div>
            )}
          </div>
        </PageCard>
      </div>
    </PageTransition>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
        placeholder={placeholder}
      />
    </label>
  )
}

function TemplateOption({
  title,
  description,
  selected,
  onClick,
}: {
  title: string
  description: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        selected
          ? 'border-teal-300 bg-white text-slate-900 ring-2 ring-teal-500/20'
          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">{description}</span>
    </button>
  )
}
