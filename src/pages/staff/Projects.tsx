import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../supabaseClient'
import { usePageTitle } from '../../usePageTitle'
import { errMsg, fmtDate, peso, projectStatusMeta } from '../../lib/format'
import type { Project, ProjectStatus } from '../../lib/types'
import { EmptyState, Modal, PageLoader, Pill } from '../../components/ui'

export default function Projects() {
  usePageTitle('Projects • OneSitio')
  const [rows, setRows] = useState<Project[] | null>(null)
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRows((data as Project[]) ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [reload])

  if (rows === null) return <PageLoader />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="page-sub">Shown publicly on the home page. Status and progress changes are logged to the ledger.</p>
        </div>
        <button type="button" className="btn btn-ink" onClick={() => setEditing('new')}>
          <i className="bi bi-plus-lg"></i> New project
        </button>
      </div>

      <div className="panel">
        {rows.length === 0 ? (
          <EmptyState icon="bi-cone-striped" title="No projects yet" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Project</th><th>Budget</th><th>Contractor</th><th>Progress</th><th>Start</th><th className="text-end">Status</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                    <td>
                      <div className="fw-medium">{p.title}</div>
                      <div className="small text-muted">{p.location}</div>
                    </td>
                    <td className="small">{peso(p.budget)}</td>
                    <td className="small">{p.contractor || '—'}</td>
                    <td style={{ minWidth: 120 }}>
                      <div className="small mb-1">{p.progress}%</div>
                      <div className="progress-thin"><span style={{ width: `${p.progress}%` }}></span></div>
                    </td>
                    <td className="small text-muted">{fmtDate(p.start_date)}</td>
                    <td className="text-end"><Pill tone={projectStatusMeta[p.status].tone}>{projectStatusMeta[p.status].label}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProjectModal
          key={editing === 'new' ? 'new' : editing.id}
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setReload((n) => n + 1) }}
        />
      )}
    </>
  )
}

function ProjectModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: project?.title ?? '',
    location: project?.location ?? '',
    description: project?.description ?? '',
    budget: String(project?.budget ?? ''),
    contractor: project?.contractor ?? '',
    status: (project?.status ?? 'proposed') as ProjectStatus,
    progress: project?.progress ?? 0,
    image_url: project?.image_url ?? '',
    start_date: project?.start_date ?? '',
    end_date: project?.end_date ?? '',
  })
  const [image, setImage] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!f.title.trim()) return setError('Title is required.')
    setSaving(true)
    setError('')
    try {
      let imageUrl = f.image_url.trim() || null
      if (image) {
        const path = `projects/${Date.now()}-${image.name.replace(/[^a-z0-9.]+/gi, '-')}`
        const { error: upErr } = await supabase.storage.from('project-images').upload(path, image, { upsert: true })
        if (upErr) throw upErr
        imageUrl = supabase.storage.from('project-images').getPublicUrl(path).data.publicUrl
      }
      const row = {
        title: f.title.trim(),
        location: f.location.trim() || null,
        description: f.description.trim() || null,
        budget: Number(f.budget) || 0,
        contractor: f.contractor.trim() || null,
        status: f.status,
        progress: Math.max(0, Math.min(100, Number(f.progress) || 0)),
        image_url: imageUrl,
        start_date: f.start_date || null,
        end_date: f.end_date || null,
      }
      const { error: dbErr } = project
        ? await supabase.from('projects').update(row).eq('id', project.id)
        : await supabase.from('projects').insert(row)
      if (dbErr) throw dbErr
      onSaved()
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      wide
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      footer={
        <>
          <button type="button" className="btn btn-line" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-ink" onClick={() => save()} disabled={saving}>Save project</button>
        </>
      }
    >
      <form className="row g-3" onSubmit={save}>
        <div className="col-md-8">
          <label className="form-label">Title</label>
          <input className="form-control" value={f.title} onChange={(e) => set('title', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Location</label>
          <input className="form-control" value={f.location} onChange={(e) => set('location', e.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">Description</label>
          <textarea className="form-control" rows={3} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </div>
        <div className="col-md-4">
          <label className="form-label">Budget (₱)</label>
          <input type="number" min="0" className="form-control" value={f.budget} onChange={(e) => set('budget', e.target.value)} />
        </div>
        <div className="col-md-8">
          <label className="form-label">Contractor</label>
          <input className="form-control" value={f.contractor} onChange={(e) => set('contractor', e.target.value)} placeholder="Leave blank if for bidding" />
        </div>
        <div className="col-md-4">
          <label className="form-label">Status</label>
          <select className="form-select" value={f.status} onChange={(e) => set('status', e.target.value as ProjectStatus)}>
            {(Object.keys(projectStatusMeta) as ProjectStatus[]).map((s) => <option key={s} value={s}>{projectStatusMeta[s].label}</option>)}
          </select>
        </div>
        <div className="col-md-8">
          <label className="form-label">Progress: {f.progress}%</label>
          <input type="range" className="form-range" min={0} max={100} step={5} value={f.progress} onChange={(e) => set('progress', Number(e.target.value))} />
        </div>
        <div className="col-md-6">
          <label className="form-label">Start date</label>
          <input type="date" className="form-control" value={f.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </div>
        <div className="col-md-6">
          <label className="form-label">End date</label>
          <input type="date" className="form-control" value={f.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
        <div className="col-12">
          <label className="form-label">Photo</label>
          <input type="file" accept="image/*" className="form-control" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
          {f.image_url && !image && <div className="form-text">Current: {f.image_url}</div>}
        </div>
        {error && <div className="col-12"><div className="field-error">{error}</div></div>}
      </form>
    </Modal>
  )
}
