import { useState, useEffect, useCallback, useRef } from 'react'

// ── API base URL ──
const API = import.meta.env.VITE_API_URL || ''

async function api(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}

// ── LocalStorage persistence ──
const STORAGE_KEY = 'datapulse_settings'

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveSettings(updates) {
  try {
    const current = loadSettings()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...updates }))
  } catch {}
}

// ── Helpers ──
function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let b = bytes
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++ }
  return `${b.toFixed(1)} ${units[i]}`
}

function timeAgo(iso) {
  if (!iso) return '—'
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

// ═══════════════════════════════════════════════
//  LOGIN SCREEN
// ═══════════════════════════════════════════════
function LoginScreen({ onLogin, error, loading }) {
  const saved = loadSettings()
  const [mode, setMode] = useState(saved.loginMode || 'ssoid')
  const [ssoid, setSsoid] = useState(saved.ssoid || '')
  const [username, setUsername] = useState(saved.username || '')
  const [password, setPassword] = useState('')
  const [appKey, setAppKey] = useState(saved.appKey || '')

  // Persist as user types
  useEffect(() => { saveSettings({ appKey, loginMode: mode, username, ssoid }) }, [appKey, mode, username, ssoid])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!appKey.trim()) return
    if (mode === 'ssoid') {
      onLogin({ mode: 'ssoid', ssoid: ssoid.trim(), appKey: appKey.trim() })
    } else {
      onLogin({ mode: 'credentials', username: username.trim(), password, appKey: appKey.trim() })
    }
  }

  return (
    <div className="login-screen">
      <div className="login-overlay" />
      <form className="glass-panel login-panel" onSubmit={handleSubmit}>
        <div className="logo-section">
          <div className="app-title">CHIMERA DataPulse</div>
          <div className="app-subtitle">LIVE MARKET DATA RECORDER</div>
        </div>

        <div className="separator" />

        {error && <div className="error-message">{error}</div>}

        <div className="form-group">
          <label className="form-label">Betfair Application Key</label>
          <input
            className="form-input"
            type="text"
            value={appKey}
            onChange={e => setAppKey(e.target.value)}
            placeholder="Enter app key"
            autoComplete="off"
          />
        </div>

        <div className="auth-toggle">
          <button
            type="button"
            className={`toggle-btn ${mode === 'ssoid' ? 'active' : ''}`}
            onClick={() => setMode('ssoid')}
          >SSOID</button>
          <button
            type="button"
            className={`toggle-btn ${mode === 'credentials' ? 'active' : ''}`}
            onClick={() => setMode('credentials')}
          >Username / Password</button>
        </div>

        {mode === 'ssoid' ? (
          <div className="form-group">
            <label className="form-label">Session Token (SSOID)</label>
            <input
              className="form-input"
              type="text"
              value={ssoid}
              onChange={e => setSsoid(e.target.value)}
              placeholder="Paste your SSOID"
              autoComplete="off"
            />
          </div>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Betfair username"
                autoComplete="username"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Betfair password"
                autoComplete="current-password"
              />
            </div>
          </>
        )}

        <button className="button-primary" type="submit" disabled={loading || !appKey.trim()}>
          {loading ? 'Authenticating...' : 'Connect to Betfair'}
        </button>

        <div className="copyright">CHIMERA Platform · Ascot Wealth Management</div>
      </form>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  CONFIGURATION PANEL
// ═══════════════════════════════════════════════
function ConfigPanel({ config, onSave, onTestGcs, gcsTestResult, saving }) {
  const saved = loadSettings()
  const [gcsProject, setGcsProject] = useState(saved.gcsProject || config.gcs_project || '')
  const [gcsBucket, setGcsBucket] = useState(saved.gcsBucket || config.gcs_bucket || '')
  const [gcsCreds, setGcsCreds] = useState(saved.gcsCreds || '')
  const [pollInterval, setPollInterval] = useState(saved.pollInterval || config.poll_interval || 60)

  // Sync from server config only if local is empty
  useEffect(() => {
    if (!gcsProject && config.gcs_project) setGcsProject(config.gcs_project)
    if (!gcsBucket && config.gcs_bucket) setGcsBucket(config.gcs_bucket)
    if (pollInterval === 60 && config.poll_interval && config.poll_interval !== 60) setPollInterval(config.poll_interval)
  }, [config])

  // Persist as user types
  useEffect(() => {
    saveSettings({ gcsProject, gcsBucket, gcsCreds, pollInterval })
  }, [gcsProject, gcsBucket, gcsCreds, pollInterval])

  const handleSave = () => {
    onSave({
      gcs_project: gcsProject,
      gcs_bucket: gcsBucket,
      gcs_credentials: gcsCreds || undefined,
      poll_interval: pollInterval,
    })
  }

  return (
    <div className="glass-panel config-panel">
      <div className="panel-title">⚙ Storage Configuration</div>

      <div className="form-group">
        <label className="form-label">GCP Project ID</label>
        <input
          className="form-input"
          value={gcsProject}
          onChange={e => setGcsProject(e.target.value)}
          placeholder="your-gcp-project-id"
        />
      </div>

      <div className="form-group">
        <label className="form-label">GCS Bucket</label>
        <input
          className="form-input"
          value={gcsBucket}
          onChange={e => setGcsBucket(e.target.value)}
          placeholder="chimera-datapulse-live"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Service Account JSON Path</label>
        <input
          className="form-input"
          value={gcsCreds}
          onChange={e => setGcsCreds(e.target.value)}
          placeholder="Leave blank for Cloud Run default credentials"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Poll Interval (seconds)</label>
        <input
          className="form-input"
          type="number"
          min="10"
          max="300"
          value={pollInterval}
          onChange={e => setPollInterval(parseInt(e.target.value) || 60)}
        />
      </div>

      {gcsTestResult && (
        <div className={`validation-result ${gcsTestResult.ok ? 'valid' : 'invalid'}`}>
          {gcsTestResult.message}
        </div>
      )}

      <div className="config-actions">
        <button className="button-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        <button className="button-check" onClick={onTestGcs} style={{ marginTop: 8 }}>
          Test GCS Connection
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  ENGINE CONTROL PANEL
// ═══════════════════════════════════════════════
function EngineControl({ state, onStart, onStop }) {
  const status = state.status || 'STOPPED'
  const isRunning = status === 'RUNNING'
  const isStarting = status === 'STARTING'

  return (
    <div className="glass-panel engine-panel">
      <div className="panel-title">⚡ Recording Engine</div>

      <div className="engine-status-row">
        <div className={`status-indicator ${isRunning ? 'running' : isStarting ? 'starting' : 'stopped'}`} />
        <span className="engine-status-text">{status}</span>
      </div>

      <div className="engine-info">
        <div className="info-row">
          <span className="info-label">Date</span>
          <span className="info-value">{state.date || '—'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Poll Cycle</span>
          <span className="info-value">{state.poll_cycle || 0}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Last Poll</span>
          <span className="info-value">{timeAgo(state.last_poll)}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Poll Duration</span>
          <span className="info-value">{state.last_poll_duration || 0}s</span>
        </div>
        <div className="info-row">
          <span className="info-label">Balance</span>
          <span className="info-value balance">
            {state.balance != null ? `£${state.balance.toFixed(2)}` : '—'}
          </span>
        </div>
      </div>

      {isRunning || isStarting ? (
        <button className="button-abort" onClick={onStop}>Stop Recording</button>
      ) : (
        <button className="button-primary" onClick={onStart}>Start Recording</button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  STATS PANEL
// ═══════════════════════════════════════════════
function StatsPanel({ state }) {
  const summary = state.summary || {}
  const storage = state.storage || {}

  return (
    <div className="glass-panel stats-panel">
      <div className="panel-title">📊 Today's Statistics</div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-value">{summary.total_markets_discovered || 0}</div>
          <div className="stat-card-label">Markets Found</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value cyan">{summary.active_markets || 0}</div>
          <div className="stat-card-label">Active Now</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value green">{summary.total_snapshots || 0}</div>
          <div className="stat-card-label">Snapshots Saved</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value purple">{summary.closed_markets || 0}</div>
          <div className="stat-card-label">Markets Closed</div>
        </div>
      </div>

      <div className="separator" />

      <div className="storage-stats">
        <div className="info-row">
          <span className="info-label">Files Written</span>
          <span className="info-value">{storage.files_written || 0}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Data Stored</span>
          <span className="info-value">{storage.bytes_human || '0 B'}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Storage Errors</span>
          <span className={`info-value ${(storage.errors || 0) > 0 ? 'error' : ''}`}>
            {storage.errors || 0}
          </span>
        </div>
        <div className="info-row">
          <span className="info-label">API Requests</span>
          <span className="info-value">{summary.api_requests || 0}</span>
        </div>
        <div className="info-row">
          <span className="info-label">Bucket</span>
          <span className="info-value mono">{storage.bucket || '—'}</span>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  ACTIVE MARKETS TABLE
// ═══════════════════════════════════════════════
function MarketsTable({ markets }) {
  if (!markets || markets.length === 0) {
    return (
      <div className="glass-panel">
        <div className="panel-title">🏇 Active Markets</div>
        <div className="empty-state">No active markets — engine may be stopped or no races today</div>
      </div>
    )
  }

  return (
    <div className="glass-panel">
      <div className="panel-title">🏇 Active Markets ({markets.length})</div>
      <div className="markets-table-wrap">
        <table className="markets-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Venue</th>
              <th>Type</th>
              <th>Status</th>
              <th>Runners</th>
              <th>Matched</th>
            </tr>
          </thead>
          <tbody>
            {markets.map(m => (
              <tr key={m.market_id} className={m.in_play ? 'in-play' : ''}>
                <td className="mono">{formatTime(m.race_time)}</td>
                <td>
                  <span className="country-badge">{m.country}</span>
                  {m.venue}
                </td>
                <td>{m.market_type}</td>
                <td>
                  <span className={`status-badge ${(m.status || '').toLowerCase()}`}>
                    {m.in_play ? '● LIVE' : m.status}
                  </span>
                </td>
                <td>{m.runners_count}</td>
                <td className="mono">£{(m.total_matched || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  POLL LOG
// ═══════════════════════════════════════════════
function PollLog({ logs }) {
  const [expanded, setExpanded] = useState(false)

  if (!logs || logs.length === 0) return null

  const display = expanded ? logs : logs.slice(0, 8)

  return (
    <div className="glass-panel">
      <div className="panel-title" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        📋 Poll Log ({logs.length})
        <span className="collapse-icon">{expanded ? '▼' : '▶'}</span>
      </div>
      <div className="poll-log-list">
        {display.map((log, i) => (
          <div key={i} className="poll-log-entry">
            <span className="poll-cycle">#{log.cycle}</span>
            <span className="poll-time">{formatTime(log.timestamp)}</span>
            <span className="poll-markets">{log.markets_polled} mkts</span>
            <span className="poll-saved green">{log.saved} saved</span>
            {log.failed > 0 && <span className="poll-failed red">{log.failed} fail</span>}
            <span className="poll-duration">{log.duration}s</span>
          </div>
        ))}
      </div>
      {logs.length > 8 && (
        <button className="expand-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${logs.length}`}
        </button>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════
//  ERROR LOG
// ═══════════════════════════════════════════════
function ErrorLog({ errors }) {
  if (!errors || errors.length === 0) return null

  return (
    <div className="glass-panel error-panel">
      <div className="panel-title">⚠ Errors ({errors.length})</div>
      <div className="error-log-list">
        {errors.map((err, i) => (
          <div key={i} className="error-log-entry">
            <span className="error-time">{formatTime(err.timestamp)}</span>
            <span className="error-msg">{err.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════
//  MAIN APP
// ═══════════════════════════════════════════════
export default function App() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [state, setState] = useState({})
  const [config, setConfig] = useState({})
  const [gcsTestResult, setGcsTestResult] = useState(null)
  const [configSaving, setConfigSaving] = useState(false)
  const [view, setView] = useState('dashboard') // 'dashboard' or 'config'
  const pollRef = useRef(null)

  // ── State polling ──
  const fetchState = useCallback(async () => {
    try {
      const data = await api('/api/state')
      setState(data)
      if (!data.authenticated) {
        setAuthenticated(false)
      }
    } catch {
      // Server unreachable — keep last state
    }
  }, [])

  useEffect(() => {
    if (!authenticated) return
    fetchState()
    pollRef.current = setInterval(fetchState, 5000)
    return () => clearInterval(pollRef.current)
  }, [authenticated, fetchState])

  // ── Login ──
  const handleLogin = async ({ mode, ssoid, username, password, appKey }) => {
    setLoginLoading(true)
    setLoginError('')
    try {
      // First configure the app key
      await api('/api/config', {
        method: 'POST',
        body: JSON.stringify({ app_key: appKey }),
      })

      // Then authenticate
      if (mode === 'ssoid') {
        await api('/api/login/ssoid', {
          method: 'POST',
          body: JSON.stringify({ ssoid }),
        })
      } else {
        await api('/api/login/credentials', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        })
      }

      // Fetch initial config
      const cfg = await api('/api/config')
      setConfig(cfg)
      setAuthenticated(true)
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  // ── Logout ──
  const handleLogout = async () => {
    try { await api('/api/logout', { method: 'POST' }) } catch {}
    setAuthenticated(false)
    setState({})
    clearInterval(pollRef.current)
  }

  // ── Engine controls ──
  const handleStart = async () => {
    try {
      await api('/api/engine/start', { method: 'POST' })
      fetchState()
    } catch (err) {
      alert(`Start failed: ${err.message}`)
    }
  }

  const handleStop = async () => {
    try {
      await api('/api/engine/stop', { method: 'POST' })
      fetchState()
    } catch (err) {
      alert(`Stop failed: ${err.message}`)
    }
  }

  // ── Config ──
  const handleSaveConfig = async (cfg) => {
    setConfigSaving(true)
    setGcsTestResult(null)
    try {
      const res = await api('/api/config', {
        method: 'POST',
        body: JSON.stringify(cfg),
      })
      setConfig(res.config || cfg)
    } catch (err) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setConfigSaving(false)
    }
  }

  const handleTestGcs = async () => {
    setGcsTestResult(null)
    try {
      await api('/api/config/test-gcs', { method: 'POST' })
      setGcsTestResult({ ok: true, message: '✓ GCS connection successful' })
    } catch (err) {
      setGcsTestResult({ ok: false, message: `✗ ${err.message}` })
    }
  }

  // ── Render ──
  if (!authenticated) {
    return <LoginScreen onLogin={handleLogin} error={loginError} loading={loginLoading} />
  }

  return (
    <div className="app">
      <div className="dashboard">
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <div className="header-title">CHIMERA DataPulse</div>
            <div className="header-subtitle">LIVE MARKET DATA RECORDER</div>
          </div>
          <div className="header-right">
            <div className="nav-tabs">
              <button
                className={`nav-tab ${view === 'dashboard' ? 'active' : ''}`}
                onClick={() => setView('dashboard')}
              >Dashboard</button>
              <button
                className={`nav-tab ${view === 'config' ? 'active' : ''}`}
                onClick={() => setView('config')}
              >Configuration</button>
            </div>
            <button className="button-logout" onClick={handleLogout}>Logout</button>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          {view === 'config' ? (
            <div className="config-view">
              <ConfigPanel
                config={config}
                onSave={handleSaveConfig}
                onTestGcs={handleTestGcs}
                gcsTestResult={gcsTestResult}
                saving={configSaving}
              />
            </div>
          ) : (
            <div className="dashboard-view">
              <div className="dashboard-top">
                <EngineControl state={state} onStart={handleStart} onStop={handleStop} />
                <StatsPanel state={state} />
              </div>

              <MarketsTable markets={state.active_markets} />
              <PollLog logs={state.poll_log} />
              <ErrorLog errors={state.errors} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}