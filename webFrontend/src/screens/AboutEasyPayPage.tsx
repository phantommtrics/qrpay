import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  FileText,
  Link2,
  QrCode,
  Shield,
  Store,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'

const pillars = [
  {
    icon: Building2,
    title: 'Organizations & plans',
    body:
      'Create an organization, choose a subscription plan that fits your team size, and manage trial and renewal billing from a dedicated billing area. Plans bundle modules and permissions so you only pay for the depth you need.',
  },
  {
    icon: Store,
    title: 'Catalog, POS & orders',
    body:
      'Maintain products and category structures for retail-style selling or specialized setups. Staff use point-of-sale flows to build orders, take cash or digital wallet checkout where configured, issue receipts, and review payments and activity.',
  },
  {
    icon: Wallet,
    title: 'Digital wallet checkout',
    body:
      'When your plan supports it, connect your own wallet-provider credentials (for example APS Wallet,Wave or Yonna Wallet) in Merchant API settings. Customer checkout for orders and approved invoices uses your business configuration—your relationship and fee structure with the wallet provider stays between you and them.',
  },
  {
    icon: FileText,
    title: 'Quotations & invoices',
    body:
      'Work with contacts, send professional quotations with PDFs and secure guest links, and convert accepted quotes into invoices. Approve invoices, email customers, and optionally let them pay from a guest portal using the same wallet options you enable for in-store sales.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Restaurant guest ordering',
    body:
      'Configure dining tables with printable QR codes so guests open your menu from their phones without an account. Orders flow into the same order pipeline your team already uses for fulfillment and payment.',
  },
  {
    icon: BookOpen,
    title: 'Accounting & reporting',
    body:
      'Each business maintains its own chart of accounts, journals, and reporting views—including general ledger, profit and loss, balance sheet, and account statements—aligned with how sales and invoice payments post in the system.',
  },
  {
    icon: Shield,
    title: 'Team access & security',
    body:
      'Owners have full access to their plan. For other staff, you assign which plan modules they may use. Sensitive integration secrets are stored encrypted per business, and authenticated work runs with clear business context on every request.',
  },
  {
    icon: Link2,
    title: 'Integrations & ecosystem',
    body:
      'Beyond wallet adapters, the platform supports structured internal partner APIs for trusted server-to-server integrations—useful when another system should provision or synchronize data with DPay under your control.',
  },
] as const

export function AboutEasyPayPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link
            to={APP_PATHS.root}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            Back
          </Link>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Link
              to={APP_PATHS.login}
              className="rounded-full border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:px-4"
            >
              Sign in
            </Link>
            <Link
              to={APP_PATHS.signup}
              className="rounded-full bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500 sm:px-4"
            >
              Create organization
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.3),transparent_50%)]" aria-hidden />
        <div className="relative mx-auto max-w-5xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-400">About DPay</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            The subscription-ready platform for serious merchants
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            DPay brings storefront tools, staff-aware subscriptions, wallet checkout,
            sales documents, optional restaurant QR ordering, and real accounting into one
            coherent product—so you spend less time stitching spreadsheets and more time serving
            customers.
          </p>
        </div>
      </section>

      <article className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="prose prose-slate max-w-none prose-headings:font-bold prose-p:text-slate-600 prose-li:text-slate-600">
          <h2 className="text-2xl text-slate-900">What DPay is</h2>
          <p>
            DPay is a <strong>multi-tenant web application</strong>: each <strong>business</strong>{' '}
            you operate is its own space for products, orders, contacts, quotations, invoices,
            payments, and books. One user account can be granted access to <strong>multiple</strong>{' '}
            businesses—ideal for owners with more than one brand or location—using an in-app
            business switcher after sign-in.
          </p>
          <p>
            The product is developed by <strong>Phantom Metrics Ltd</strong> (The Gambia). DPay
            is offered on a <strong>subscription</strong> basis: you receive invoices for the
            software, and your subscription status controls access to modules according to your
            plan.
          </p>

          <h2 className="mt-12 text-2xl text-slate-900">Who it is built for</h2>
          <ul>
            <li>
              <strong>Retail and service counters</strong> that need reliable POS, receipts, and
              payment history.
            </li>
            <li>
              <strong>Restaurants and cafés</strong> that want table-based QR menus and guest orders
              without forcing diners to install an app.
            </li>
            <li>
              <strong>B2B and professional services</strong> that issue quotations, track acceptance,
              and collect on invoices with optional wallet pay links.
            </li>
            <li>
              <strong>Growing teams</strong> that need clear roles and plan-based permissions—not
              everyone sees everything.
            </li>
            <li>
              <strong>Operators who want ledgers</strong>, not only a cash register: chart of
              accounts, journals, and financial reports tied to how you sell.
            </li>
          </ul>

          <h2 className="mt-12 text-2xl text-slate-900">Two kinds of payments (kept separate)</h2>
          <p>
            The system deliberately separates <strong>what you pay DPay</strong> for your
            subscription from <strong>what your customers pay you</strong> for goods and services.
            Subscription checkout uses <strong>platform</strong> configuration. Customer wallet
            flows use <strong>your business&apos;s</strong> gateway credentials where you connect
            them—so settlement and wallet-provider fees follow the agreement between{' '}
            <strong>your business</strong> and <strong>your wallet provider</strong>.
          </p>

          <h2 className="mt-12 text-2xl text-slate-900">Capabilities at a glance</h2>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {pillars.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-sm transition hover:border-teal-200 hover:shadow-md sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="prose prose-slate mt-14 max-w-none prose-p:text-slate-600">
          <h2 className="text-2xl text-slate-900">Petrol, catalog, and public surfaces</h2>
          <p>
            Where your plan allows, you can use <strong>multi-site petrol</strong> style setup for
            branches and pumps, maintain <strong>product catalog</strong> trees suited to wholesale
            or pharmacy-style categories (alongside restaurant menu tooling), and share{' '}
            <strong>public product pages</strong> for individual items—complementing the full
            authenticated merchant experience.
          </p>

          <div className="not-prose mt-10 flex flex-col items-start gap-4 rounded-2xl border border-teal-200 bg-teal-50/60 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <QrCode className="mt-0.5 h-8 w-8 shrink-0 text-teal-700" aria-hidden />
              <div>
                <p className="font-semibold text-slate-900">Ready to onboard?</p>
                <p className="mt-1 text-sm text-slate-600">
                  Create your organization, pick a plan, and invite your team when you are ready.
                </p>
              </div>
            </div>
            <Link
              to={APP_PATHS.signup}
              className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 sm:w-auto"
            >
              Get started
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Link>
          </div>

          <p className="mt-10 text-center text-xs text-slate-500">
            DPay is a product of Phantom Metrics Ltd, The Gambia. Features available to your
            organization depend on your subscription plan and platform configuration.
          </p>
        </div>
      </article>
    </div>
  )
}
