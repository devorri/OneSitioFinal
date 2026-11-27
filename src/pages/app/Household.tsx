import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/context'
import { usePageTitle } from '../../usePageTitle'
import { ageFrom, errMsg, fmtDate } from '../../lib/format'
import type { HouseholdMember } from '../../lib/types'
import { EmptyState, PageLoader } from '../../components/ui'

const RELATIONSHIPS = ['Anak (Child)', 'Asawa (Spouse)', 'Magulang (Parent)', 'Lolo / Lola', 'Kapatid (Sibling)', 'Apo (Grandchild)', 'Other']

export default function Household() {
  usePageTitle('Household • OneSitio')
  const { profile, refreshProfile } = useAuth()
  const [members, setMembers] = useState<HouseholdMember[] | null>(null)
  const [name, setName] = useState('')
  const [relationship, setRelationship] = useState(RELATIONSHIPS[0])
  const [birth, setBirth] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    supabase
      .from('household_members')
      .select('*')
      .eq('head_id', profile.id)
      .order('created_at')
      .then(({ data }) => {
        if (!cancelled) setMembers((data as HouseholdMember[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [profile, reload])

  if (!profile || members === null) return <PageLoader />

  const becomeHead = async () => {
    const { error: e } = await supabase.from('profiles').update({ is_household_head: true }).eq('id', profile.id)
    if (e) return setError(errMsg(e))
    await refreshProfile()
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Enter the member’s full name.')
    setSaving(true)
    setError('')
    const { error: insErr } = await supabase.from('household_members').insert({
      head_id: profile.id,
      full_name: name.trim(),
      relationship,
      birth_date: birth || null,
    })
    setSaving(false)
    if (insErr) return setError(errMsg(insErr))
    setName('')
    setBirth('')
    setReload((n) => n + 1)
  }

  const remove = async (m: HouseholdMember) => {
    if (!window.confirm(`Remove ${m.full_name} from your household?`)) return
    const { error: delErr } = await supabase.from('household_members').delete().eq('id', m.id)
    if (delErr) return setError(errMsg(delErr))
    setReload((n) => n + 1)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Household</h1>
          <p className="page-sub">Family members you can request documents for.</p>
        </div>
      </div>

      {!profile.is_household_head ? (
        <div className="panel">
          <EmptyState
            icon="bi-people"
            title="You’re not set as head of household"
            text="Heads of household can add children, parents, or grandparents and request documents for them."
            action={<button type="button" className="btn btn-ink btn-sm" onClick={becomeHead}>I’m the head of my household</button>}
          />
          {error && <div className="field-error text-center">{error}</div>}
        </div>
      ) : (
        <div className="row g-3">
          <div className="col-lg-7">
            <div className="panel">
              <div className="panel-head"><h2>Members ({members.length})</h2></div>
              {members.length === 0 ? (
                <EmptyState icon="bi-person-plus" title="No members yet" text="Add your first household member." />
              ) : (
                <table className="data-table">
                  <thead><tr><th>Name</th><th>Relationship</th><th>Birth date</th><th></th></tr></thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td className="fw-medium">{m.full_name}</td>
                        <td className="small">{m.relationship}</td>
                        <td className="small text-muted">{m.birth_date ? `${fmtDate(m.birth_date)} (${ageFrom(m.birth_date)})` : '—'}</td>
                        <td className="text-end">
                          <button type="button" className="icon-btn" onClick={() => remove(m)} title="Remove" aria-label={`Remove ${m.full_name}`}>
                            <i className="bi bi-trash3"></i>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div className="col-lg-5">
            <form className="panel d-grid gap-3" onSubmit={add}>
              <div className="panel-head mb-0"><h2>Add member</h2></div>
              <div>
                <label className="form-label">Full name</label>
                <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Santos Dela Cruz" />
              </div>
              <div>
                <label className="form-label">Relationship</label>
                <select className="form-select" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Birth date <span className="text-muted">(optional)</span></label>
                <input type="date" className="form-control" value={birth} onChange={(e) => setBirth(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              </div>
              {error && <div className="field-error">{error}</div>}
              <button className="btn btn-ink" disabled={saving}>Add member</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
