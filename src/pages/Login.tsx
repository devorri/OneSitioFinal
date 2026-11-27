import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { usePageTitle } from '../usePageTitle'
import { useAuth } from '../auth/context'
import { forgetAccount, getRecentAccounts, rememberAccount, type RecentAccount } from '../lib/recent'
import { fullName, initialsOf } from '../lib/format'
import SocialButtons from '../components/SocialButtons'
import { PageLoader } from '../components/ui'
import './Login.css'

type Lang = 'fil' | 'en'
const LANG_KEY = 'onesitio-lang'

function loadLang(): Lang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fil'
  } catch {
    return 'fil'
  }
}

function saveLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
}

const languages: { code: Lang; label: string }[] = [
  { code: 'fil', label: 'Filipino' },
  { code: 'en', label: 'English' },
]

const text = {
  fil: {
    pageTitle: 'Mag-log in • OneSitio',
    eyebrow: 'Mabuhay, Talampas!',
    taglineStart: 'Serbisyong barangay, ',
    taglineBlue: 'nasa kamay',
    taglineRed: 'mo',
    credit: (
      <>
        Hango sa <strong>CADENA Act</strong> (Citizen Access and Disclosure of Expenditures for National Accountability),
        na kilala rin bilang &ldquo;Blockchain the Budget&rdquo; bill &mdash; Senate Bill No. 1506, na pangunahing inakda ni
        Sen. Bam Aquino. Isang proyekto ng mag-aaral; hindi kaanib o inendorso ng Senado o ni Sen. Aquino.
      </>
    ),
    loginTitle: 'Mag-log in sa OneSitio',
    manage: 'Pamahalaan ang mga account',
    done: 'Tapos na',
    residentSub: 'Residente',
    staffSub: 'Barangay Staff',
    useAnother: 'Gumamit ng ibang account',
    back: 'Bumalik',
    email: 'Email',
    password: 'Password',
    showPassword: 'Ipakita ang password',
    submit: 'Mag-log in',
    submitting: 'Nagla-log in…',
    or: 'o',
    google: 'Magpatuloy gamit ang Google',
    facebook: 'Magpatuloy gamit ang Facebook',
    forgot: 'Nakalimutan ang password?',
    resetSent: 'Nagpadala kami ng link sa iyong email para mag-reset ng password.',
    needEmail: 'Ilagay muna ang iyong email sa itaas.',
    errEmpty: 'Ilagay ang iyong email at password.',
    errInvalid: 'Mali ang email o password.',
    errUnconfirmed: 'Hindi pa kumpirmado ang email mo. Tingnan ang iyong inbox.',
    createAccount: 'Gumawa ng bagong account',
    footer: [
      { label: 'Magrehistro', to: '/register' },
      { label: 'Home', to: '/' },
      { label: 'Mga Serbisyo', to: '/#services' },
      { label: 'Subaybayan ang Request', to: '/#tracker' },
      { label: 'Transparency Ledger', to: '/transparency' },
      { label: 'Mga Proyekto', to: '/#projects' },
      { label: 'FAQ', to: '/#faq' },
      { label: 'Data Privacy (RA 10173)', to: '/#faq' },
    ],
  },
  en: {
    pageTitle: 'Log in • OneSitio',
    eyebrow: 'Mabuhay, Talampas!',
    taglineStart: 'Barangay services, ',
    taglineBlue: 'right in your',
    taglineRed: 'hands',
    credit: (
      <>
        Inspired by the <strong>CADENA Act</strong> (Citizen Access and Disclosure of Expenditures for National
        Accountability), also known as the &ldquo;Blockchain the Budget&rdquo; bill &mdash; Senate Bill No. 1506,
        principally authored by Sen. Bam Aquino. A student project; not affiliated with or endorsed by the Senate or
        Sen. Aquino.
      </>
    ),
    loginTitle: 'Log in to OneSitio',
    manage: 'Manage accounts',
    done: 'Done',
    residentSub: 'Resident',
    staffSub: 'Barangay Staff',
    useAnother: 'Use another account',
    back: 'Back',
    email: 'Email',
    password: 'Password',
    showPassword: 'Show password',
    submit: 'Log in',
    submitting: 'Logging in…',
    or: 'or',
    google: 'Continue with Google',
    facebook: 'Continue with Facebook',
    forgot: 'Forgot password?',
    resetSent: 'We sent a password reset link to your email.',
    needEmail: 'Enter your email above first.',
    errEmpty: 'Please enter your email and password.',
    errInvalid: 'Incorrect email or password.',
    errUnconfirmed: 'Your email isn’t confirmed yet. Please check your inbox.',
    createAccount: 'Create new account',
    footer: [
      { label: 'Sign up', to: '/register' },
      { label: 'Home', to: '/' },
      { label: 'Services', to: '/#services' },
      { label: 'Track Request', to: '/#tracker' },
      { label: 'Transparency Ledger', to: '/transparency' },
      { label: 'Projects', to: '/#projects' },
      { label: 'FAQ', to: '/#faq' },
      { label: 'Data Privacy (RA 10173)', to: '/#faq' },
    ],
  },
}

type MsgKey = 'errEmpty' | 'errInvalid' | 'errUnconfirmed' | 'needEmail' | 'resetSent'

function PhSun({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d="M50 4 L55 26 L50 32 L45 26 Z" transform={`rotate(${i * 45} 50 50)`} fill="currentColor" />
      ))}
      <circle cx="50" cy="50" r="17" fill="currentColor" />
    </svg>
  )
}

function PhStar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8-6.2 3.8 1.6-7L2 9.2l7.1-.6z" fill="currentColor" />
    </svg>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { session, isStaff, loading } = useAuth()
  const passwordRef = useRef<HTMLInputElement>(null)

  const [lang, setLang] = useState<Lang>(loadLang)
  const t = text[lang]
  usePageTitle(t.pageTitle)

  useEffect(() => {
    document.documentElement.lang = lang === 'fil' ? 'fil' : 'en'
  }, [lang])

  const [recent, setRecent] = useState<RecentAccount[]>(getRecentAccounts)
  const [view, setView] = useState<'accounts' | 'form'>(() => (getRecentAccounts().length ? 'accounts' : 'form'))
  const [editing, setEditing] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<MsgKey | string | null>(null)
  const [info, setInfo] = useState<MsgKey | null>(null)

  const from = (location.state as { from?: string } | null)?.from

  if (loading && !submitting) return <PageLoader />
  if (session && !submitting) return <Navigate to={from ?? (isStaff ? '/staff' : '/app')} replace />

  const changeLang = (l: Lang) => {
    setLang(l)
    saveLang(l)
  }

  const pick = (acc: RecentAccount) => {
    if (editing) {
      forgetAccount(acc.email)
      const next = getRecentAccounts()
      setRecent(next)
      if (next.length === 0) {
        setEditing(false)
        setView('form')
      }
      return
    }
    setEmail(acc.email)
    setPassword('')
    setError(null)
    setView('form')
    setTimeout(() => passwordRef.current?.focus(), 50)
  }

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setInfo(null)
    if (!email.trim() || !password) {
      setError('errEmpty')
      return
    }
    setSubmitting(true)
    setError(null)
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (authError || !data.user) {
      const msg = authError?.message ?? ''
      setError(/invalid login/i.test(msg) ? 'errInvalid' : /not confirmed/i.test(msg) ? 'errUnconfirmed' : msg || 'errInvalid')
      setSubmitting(false)
      return
    }
    const { data: prof } = await supabase.from('profiles').select('first_name,last_name,role').eq('id', data.user.id).maybeSingle()
    const staff = !!prof && prof.role !== 'resident'
    rememberAccount({ email: email.trim(), name: prof ? fullName(prof) || email.trim() : email.trim(), staff })
    navigate(from ?? (staff ? '/staff' : '/app'), { replace: true })
  }

  const forgot = async () => {
    setError(null)
    if (!email.trim()) {
      setInfo('needEmail')
      return
    }
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` })
    setInfo('resetSent')
  }

  const msg = (k: MsgKey | string) => (k in t ? (t[k as MsgKey] as string) : k)

  return (
    <div className="os-login">
      <div className="os-login-main">
        {/* LEFT */}
        <section className="os-login-hero">
          <Link to="/" className="os-login-logo" aria-label="OneSitio Home">
            <img src="/images/talampas-logo.png" alt="Barangay Talampas Seal" />
            <span>OneSitio</span>
          </Link>

          <div className="os-collage-wrap" aria-hidden="true">
            <div className="os-hero-figure">
              <div className="os-sunburst"></div>
              <PhStar className="os-star os-star-1" />
              <PhStar className="os-star os-star-2" />
              <PhStar className="os-star os-star-3" />
              <img src="/images/login-hero.webp" alt="" className="os-hero-img" />
            </div>
          </div>

          <div className="os-tagline-wrap">
            <div className="os-eyebrow">
              <PhSun className="os-eyebrow-sun" /> {t.eyebrow}
            </div>
            <h1 className="os-tagline">
              {t.taglineStart}
              <span className="os-accent-blue">{t.taglineBlue}</span> <span className="os-accent-red">{t.taglineRed}</span>.
            </h1>
            <p className="os-credit">{t.credit}</p>
          </div>
        </section>

        {/* RIGHT */}
        <aside className="os-login-panel">
          <div className="os-panel-inner">
            {view === 'accounts' ? (
              <>
                <div className="os-panel-head">
                  <h2>{t.loginTitle}</h2>
                  <button
                    type="button"
                    className={`os-icon-btn ${editing ? 'active' : ''}`}
                    title={editing ? t.done : t.manage}
                    onClick={() => setEditing((v) => !v)}
                  >
                    <i className={`bi ${editing ? 'bi-check-lg' : 'bi-gear-fill'}`}></i>
                  </button>
                </div>

                <ul className="os-profile-list">
                  {recent.map((a) => (
                    <li key={a.email}>
                      <button type="button" className="os-profile-row" onClick={() => pick(a)}>
                        <span className="os-profile-avatar os-profile-initials">{initialsOf(a.name)}</span>
                        <span className="os-profile-text">
                          <span className="os-profile-name">{a.name}</span>
                          <span className="os-profile-sub">{a.staff ? t.staffSub : t.residentSub} · {a.email}</span>
                        </span>
                        <i className={`bi ${editing ? 'bi-x-circle-fill text-danger' : 'bi-chevron-right'} os-profile-chevron`}></i>
                      </button>
                    </li>
                  ))}
                </ul>

                <button type="button" className="os-btn os-btn-soft" onClick={() => { setEmail(''); setView('form') }}>
                  {t.useAnother}
                </button>
              </>
            ) : (
              <>
                <div className="os-panel-head">
                  {recent.length > 0 && (
                    <button type="button" className="os-icon-btn" title={t.back} onClick={() => setView('accounts')}>
                      <i className="bi bi-arrow-left"></i>
                    </button>
                  )}
                  <h2 className="flex-grow-1">{t.loginTitle}</h2>
                </div>

                {error && (
                  <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                    <i className="bi bi-exclamation-circle"></i>
                    <div>{msg(error)}</div>
                  </div>
                )}
                {info && (
                  <div className="alert alert-light border py-2 px-3 small d-flex align-items-center gap-2 mb-3">
                    <i className="bi bi-info-circle"></i>
                    <div>{msg(info)}</div>
                  </div>
                )}

                <form onSubmit={handleLogin}>
                  <input
                    type="email"
                    className="os-input"
                    placeholder={t.email}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                  />
                  <div className="os-input-wrap">
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      className="os-input"
                      placeholder={t.password}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                    <button type="button" className="os-eye" onClick={() => setShowPassword((v) => !v)} title={t.showPassword}>
                      <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                    </button>
                  </div>

                  <button type="submit" className="os-btn os-btn-primary mt-2" disabled={submitting}>
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        {t.submitting}
                      </>
                    ) : (
                      t.submit
                    )}
                  </button>
                </form>

                <div className="text-center mt-3">
                  <button type="button" className="os-link-btn" onClick={forgot}>{t.forgot}</button>
                </div>

                <div className="os-divider"><span>{t.or}</span></div>
                <SocialButtons googleLabel={t.google} facebookLabel={t.facebook} />
              </>
            )}

            <Link to="/register" className="os-btn os-btn-outline">
              {t.createAccount}
            </Link>
          </div>
        </aside>
      </div>

      <footer className="os-login-footer">
        <div className="os-footer-row">
          {languages.map((l) => (
            <button
              type="button"
              key={l.code}
              className={`os-footer-lang ${lang === l.code ? 'active' : ''}`}
              onClick={() => changeLang(l.code)}
              aria-pressed={lang === l.code}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="os-footer-row">
          {t.footer.map((l) => (
            <Link key={l.label} to={l.to}>{l.label}</Link>
          ))}
        </div>
        <div className="os-footer-copy">
          <PhSun className="os-footer-sun" /> OneSitio &copy; 2026 &bull; Sangguniang Barangay ng Talampas, Bustos, Bulacan
        </div>
      </footer>
    </div>
  )
}
