import React, { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { gsap } from 'gsap'

// ─── Types ───

interface Account {
  uid: string; name: string; user_type: string; enabled: boolean; last_status: string
  last_error: string | null; quota: number; is_quota_exceeded: boolean
  plan: string | null; user_tag: string | null; next_reset_at: number | null
  token_expires_at?: string | null
}
interface AccountsConfig { accounts: Account[]; active_uid: string | null }
interface UIStatus { ready: boolean; mode: string; username: string | null; uid: string | null; user_type: string | null; error: string | null; accounts_count: number }
interface APIConfig { auth_required: boolean; allowed_keys: string[] }
interface Message { role: 'user' | 'assistant'; content: string }
type AppTabId = 'dashboard' | 'accounts' | 'models' | 'usage' | 'playground' | 'api-keys' | 'register' | 'logs'
type Lang = 'en' | 'zh'
type ToastType = 'SUCCESS' | 'ERROR' | 'INFO'
interface ToastItem { id: number; type: ToastType; title: string; message: string }
interface UsageBucket { ts: number; label: string; requests: number; tokens: number }
interface UsageStats {
  ok: boolean
  today: { requests: number; tokens: number }
  week: { requests: number; tokens: number }
  total: { requests: number }
  keys: { used: number; configured: number }
  hourly: UsageBucket[]
  daily: UsageBucket[]
  by_model: { model: string; requests: number; tokens: number }[]
  by_key: { key: string; requests: number; tokens: number }[]
  by_account: { uid: string; name: string; requests: number; tokens: number }[]
}

interface RegTask {
  stage: string
  logs: string[]
  result: { email: string; password: string; name: string; device: { token: string; refresh_token: string; user_id: string; expires_at: string } } | null
  error: string | null
  started_at: number
}
interface RegStatus {
  running: boolean
  stop_requested: boolean
  parents: number
  started_at: number | null
  verification: string | null
  stats: { success: number; failed: number; total: number }
  active: Record<string, RegTask>
  recent: Record<string, RegTask>
}
interface QuotaEntry {
  uid: string; name: string
  quota: { userQuota: { total: number; used: number; remaining: number; percentage: number } }
}

// ─── Model catalog (loaded from GET /v1/models) ───

interface ModelInfo {
  id: string
  name: string
  provider: string
  series: string
  description: string
  contextLength: number
  efforts: string[]
  defaultEffort: string
  capabilities: string[]
  rate: string
  free: boolean
}

function formatContext(tokens: number): string {
  if (!tokens) return '—'
  return tokens >= 1_000_000 ? '1M' : `${Math.round(tokens / 1000)}K`
}

function mapModel(raw: any): ModelInfo {
  return {
    id: String(raw?.id || ''),
    name: String(raw?.display_name || raw?.id || ''),
    provider: String(raw?.owned_by || ''),
    series: String(raw?.series || raw?.owned_by || ''),
    description: String(raw?.description || ''),
    contextLength: Number(raw?.context_length || 0),
    efforts: Array.isArray(raw?.efforts) ? raw.efforts : [],
    defaultEffort: String(raw?.default_effort || ''),
    capabilities: Array.isArray(raw?.capabilities) ? raw.capabilities : [],
    rate: String(raw?.rate || ''),
    free: Boolean(raw?.free),
  }
}

// ─── Navigation / i18n ───

const NAV_ITEMS: { id: AppTabId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', icon: 'account_balance_wallet', label: 'Account Pool' },
  { id: 'models', icon: 'hub', label: 'Models' },
  { id: 'usage', icon: 'monitoring', label: 'Usage' },
  { id: 'playground', icon: 'smart_toy', label: 'Playground' },
  { id: 'api-keys', icon: 'vpn_key', label: 'API Keys' },
  { id: 'register', icon: 'person_add', label: 'Registrar' },
  { id: 'logs', icon: 'list_alt', label: 'Logs' },
]

const UI_TEXT = {
  en: {
    nav: { dashboard: 'Dashboard', accounts: 'Account Pool', models: 'Models', usage: 'Usage', playground: 'AI Playground', apiKeys: 'API Key Management', logs: 'Logs', register: 'Auto Registrar' },
    breadcrumb: { dashboard: 'Control Panel / Overview', accounts: 'Console / Management', models: 'Gateway / Models', usage: 'Telemetry / Usage', playground: 'Playground / Experiment', apiKeys: 'Administration / Security', logs: 'System / Observability', register: 'Automation / Registrar' },
    title: { dashboard: 'System Overview', accounts: 'Account Pool', models: 'Model Matrix', usage: 'Usage Analytics', playground: 'AI Playground', apiKeys: 'API Management', logs: 'Service Logs', register: 'Auto Registrar' },
    subtitle: { dashboard: 'Gateway health, quota and model availability at a glance', accounts: 'Manage accounts used for routing and failover', models: '1M context, maximum reasoning effort, one endpoint', usage: 'Request volume and estimated token consumption', playground: 'Test prompts with reasoning stream', apiKeys: 'Keys and access control for /v1 requests', logs: 'Live request and rotation logs', register: 'Parallel account registration via email verification' },
    common: { docs: 'Docs', support: 'Support', healthy: 'Healthy', offline: 'Offline', signOut: 'Sign Out', refresh: 'Refresh', add: 'Add', delete: 'Delete', copy: 'Copy', cancel: 'Cancel', search: 'Search', all: 'All' },
    dashboard: {
      serviceStatus: 'Service Status', allGatewaysActive: 'All gateways active', noActiveSession: 'No active session', accountPool: 'Account Pool', activeSessions: 'Qoder accounts for routing', apiAuth: 'API Auth', openAccess: 'Open access', activeUser: 'Active User', recentNotifications: 'Recent Notifications', authImportError: 'Auth Import Error', sessionActive: 'Session Active', credentialConfig: 'Add Account', credentialDesc: 'Import the local Qoder session or batch import credentials exported by the registrar.', patPlaceholder: 'Enter Qoder PAT...', addPat: 'Add PAT', saving: 'Saving...', autoImport: 'Auto Import',
    },
    accounts: { desc: 'Manage Qoder accounts used by the gateway for request routing and failover.', refreshStatus: 'Refresh Status', importAccounts: 'Add Account', search: 'Search accounts...', empty: 'No accounts yet. Click Add Account to import.', showing: 'Showing {count} account(s)' },
    playground: { modelConfig: 'Model Configuration', streamResponse: 'Stream Response', systemPrompt: 'System Prompt', systemPromptPlaceholder: "Define the AI's persona...", ask: 'Ask anything...', send: 'Send', waiting: 'Waiting for response...' },
    api: { generate: 'Generate New Key', desc: 'Manage authentication keys and gateway access permissions for client requests.', gatewayAuth: 'Gateway Authentication', gatewayAuthDesc: 'Toggle API key validation for incoming /v1 requests.', systemStatus: 'System Status', activeKeys: 'Active Keys', configured: 'configured', activeAccessKeys: 'Active Access Keys', keyPlaceholder: 'Enter or paste a key...', noKeys: 'No API keys configured. Generate one above.', bestPractices: 'Security Best Practices', bestPracticesDesc: 'Do not expose API keys in client-side code. Rotate keys when they appear in logs, screenshots, or shared scripts.', securityPolicy: 'Security Policy' },
    logs: { account: 'Account', status: 'Status', range: 'Range', allAccounts: 'All Accounts', allStatuses: 'All Statuses', last24h: 'Last 24h', lastHour: 'Last hour', last7d: 'Last 7 days', noLogs: 'No logs available', noMatch: 'No logs match current filters', timestamp: 'Timestamp', level: 'Level', message: 'Message' },
    register: {
      desc: 'Register multiple Qoder accounts in parallel, pull device credentials and auto-save them into the pool. Browsers stay hidden in the background; each task pops to top once for human verification, then hides again.',
      start: 'Start Registration', starting: 'Starting...', running: 'Tasks running', idle: 'Idle',
      stageLabel: 'Stage', statusLabel: 'Status', logs: 'Live Logs', result: 'Registration Result (auto-imported)', noResult: 'No task has run yet',
      countLabel: 'Parent Threads', staggerHint: 'Each parent loops forever: 3 child tasks per batch, next batch starts automatically until you click stop',
      stop: 'Stop Registration', stopping: 'Stopping (after current batch)...', stopHint: 'Stops after the current batch finishes and reports this run\'s stats',
      verifyHint: 'Complete the human verification in the topmost browser window (slide the slider); next task takes over automatically',
      waiting: 'Waiting for human verification', task: 'Task', statsLabel: 'This Run Stats', success: 'Success', failed: 'Failed', total: 'Total', activeTasks: 'Running', recentTasks: 'Recent Done',
      stage: { idle: 'Idle', registering: 'Registering', waiting_slider: 'Waiting for human verification (topmost)', waiting_otp: 'Waiting for email code', device_auth: 'Device authorization', saving: 'Saving to DB', success: 'Success', failed: 'Failed' },
    },
  },
  zh: {
    nav: { dashboard: '控制台', accounts: '账号池', models: '模型矩阵', usage: '用量统计', playground: '调试对话', apiKeys: 'API Key 管理', logs: '服务日志', register: '自动注册机' },
    breadcrumb: { dashboard: '控制台 / 概览', accounts: '控制台 / 账号管理', models: '网关 / 模型矩阵', usage: '遥测 / 用量', playground: '调试 / 对话测试', apiKeys: '管理 / 安全', logs: '系统 / 日志', register: '自动化 / 注册机' },
    title: { dashboard: '系统概览', accounts: '账号池', models: '模型矩阵', usage: '用量统计', playground: '调试对话', apiKeys: 'API 管理', logs: '服务日志', register: '自动注册机' },
    subtitle: { dashboard: '网关健康度、额度与模型可用性一览', accounts: '管理用于请求路由与失败切换的 Qoder 账号', models: '1M 上下文、最高思考强度、一个端点全部可用', usage: '请求量与估算 Token 消耗', playground: '测试提示词与思维链流式输出', apiKeys: '管理 /v1 请求的密钥与访问控制', logs: '实时请求与账号轮转日志', register: '通过邮箱验证并行注册账号' },
    common: { docs: '文档', support: '支持', healthy: '正常', offline: '未就绪', signOut: '退出', refresh: '刷新', add: '添加', delete: '删除', copy: '复制', cancel: '取消', search: '搜索', all: '全部' },
    dashboard: {
      serviceStatus: '服务状态', allGatewaysActive: '网关可用', noActiveSession: '没有可用账号', accountPool: '账号池', activeSessions: '可参与路由的 Qoder 账号', apiAuth: 'API 鉴权', openAccess: '未开启鉴权', activeUser: '当前账号', recentNotifications: '最近状态', authImportError: '本地登录导入失败', sessionActive: '账号已连接', credentialConfig: '添加账号', credentialDesc: '导入本机 Qoder 登录，或批量导入注册机导出的凭据。', patPlaceholder: '输入 Qoder PAT...', addPat: '添加 PAT', saving: '保存中...', autoImport: '自动导入',
    },
    accounts: { desc: '管理网关用于请求路由和失败切换的 Qoder 账号。', refreshStatus: '刷新状态', importAccounts: '添加账号', search: '搜索账号...', empty: '还没有导入账号。点击「添加账号」开始。', showing: '共 {count} 个账号' },
    playground: { modelConfig: '模型配置', streamResponse: '流式响应', systemPrompt: '系统提示词', systemPromptPlaceholder: '定义模型的角色或行为...', ask: '输入要发送的内容...', send: '发送', waiting: '正在等待响应...' },
    api: { generate: '生成新 Key', desc: '管理客户端请求网关时使用的 API Key 和访问权限。', gatewayAuth: '网关 API 鉴权', gatewayAuthDesc: '控制 /v1 请求是否必须携带 API Key。', systemStatus: '系统状态', activeKeys: '可用 Key', configured: '已配置', activeAccessKeys: '已启用的 API Key', keyPlaceholder: '输入或粘贴 API Key...', noKeys: '还没有配置 API Key。请先生成并添加。', bestPractices: '安全建议', bestPracticesDesc: '不要把 API Key 写在前端代码里。如果 Key 出现在日志、截图或共享脚本中，请及时删除并重新生成。', securityPolicy: '安全策略' },
    logs: { account: '账号', status: '级别', range: '时间范围', allAccounts: '全部账号', allStatuses: '全部级别', last24h: '最近 24 小时', lastHour: '最近 1 小时', last7d: '最近 7 天', noLogs: '暂无日志', noMatch: '没有匹配当前筛选条件的日志', timestamp: '时间', level: '级别', message: '内容' },
    register: {
      desc: '并行注册多个 Qoder 账号并拉取 Device 凭据，成功后自动入库。浏览器平时隐藏后台，人机验证时置顶显示，划完一个自动轮到下一个。',
      start: '开始注册', starting: '启动中...', running: '任务运行中', idle: '空闲',
      stageLabel: '阶段', statusLabel: '状态', logs: '实时日志', result: '注册结果（已自动入库）', noResult: '尚未运行注册任务',
      countLabel: '母线程数', staggerHint: '每个母线程无限循环：每批 3 个子任务并发，注册完一批自动开下一批，直到点击停止',
      stop: '停止注册', stopping: '停止中（当前批完成后停）...', stopHint: '当前批次完成后停止，统计本次注册数',
      verifyHint: '请在置顶的浏览器窗口中完成人机验证（滑动滑块），划完自动轮到下一个',
      waiting: '等待人工验证', task: '任务', statsLabel: '本次注册统计', success: '成功', failed: '失败', total: '总计', activeTasks: '运行中任务', recentTasks: '最近完成',
      stage: { idle: '空闲', registering: '正在注册', waiting_slider: '等待人机验证（已置顶）', waiting_otp: '等待邮箱验证码', device_auth: 'Device 授权中', saving: '入库中', success: '注册成功', failed: '失败' },
    },
  },
} as const

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconFill: string }> = {
  SUCCESS: { bg: 'bg-white', border: 'border-l-[3px] border-l-mint-deep', icon: 'check_circle', iconFill: 'text-mint-deep' },
  ERROR: { bg: 'bg-white', border: 'border-l-[3px] border-l-toast-error', icon: 'error', iconFill: 'text-toast-error' },
  INFO: { bg: 'bg-white', border: 'border-l-[3px] border-l-sky-deep', icon: 'info', iconFill: 'text-sky-deep' },
}

// ─── Shared components ───

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`w-10 h-[22px] rounded-full p-0.5 transition-colors relative shrink-0 ${checked ? 'bg-ink' : 'bg-hairline-strong'} ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`block w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
    </button>
  )
}

function Modal({ title, subtitle, onClose, children, width = 'max-w-lg' }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; width?: string }) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} bg-white rounded-2xl border border-hairline shadow-2xl animate-slide-up overflow-hidden`}>
        <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-hairline">
          <div>
            <h2 className="font-display-sm text-ink">{title}</h2>
            {subtitle && <p className="text-[11px] text-body mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 text-body hover:text-ink hover:bg-canvas-soft rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <div className="p-5 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function AreaChart({ data, valueKey = 'tokens', height = 170, stroke = '#c2410c', fillTop = 'rgba(244,197,168,0.55)', fillBottom = 'rgba(244,197,168,0.04)', labelEvery = 2 }: {
  data: { label: string; requests: number; tokens: number }[]
  valueKey?: 'tokens' | 'requests'
  height?: number
  stroke?: string
  fillTop?: string
  fillBottom?: string
  labelEvery?: number
}) {
  const gradientId = React.useId().replace(/:/g, '')
  const W = 640
  const H = height
  const PAD_X = 8
  const PAD_Y = 14
  const values = data.map(d => Number(d[valueKey] || 0))
  const max = Math.max(1, ...values)
  const stepX = data.length > 1 ? (W - PAD_X * 2) / (data.length - 1) : 0
  const pts = values.map((v, i) => ({ x: PAD_X + i * stepX, y: H - PAD_Y - (v / max) * (H - PAD_Y * 2) }))
  let line = ''
  if (pts.length > 0) {
    line = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]
      const cx = ((p0.x + p1.x) / 2).toFixed(1)
      line += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
    }
  }
  const area = pts.length > 0
    ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${H - PAD_Y} L ${pts[0].x.toFixed(1)} ${H - PAD_Y} Z`
    : ''
  const hasData = values.some(v => v > 0)

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height }} preserveAspectRatio="none">
          <defs>
            <linearGradient id={`chart-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillTop} />
              <stop offset="100%" stopColor={fillBottom} />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map(f => (
            <line key={f} x1={PAD_X} x2={W - PAD_X} y1={PAD_Y + (H - PAD_Y * 2) * f} y2={PAD_Y + (H - PAD_Y * 2) * f} stroke="#e7e5e4" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          {area && <path d={area} fill={`url(#chart-${gradientId})`} />}
          {line && <path d={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        </svg>
        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] text-body/60">暂无调用数据</span>
          </div>
        )}
      </div>
      <div className="flex justify-between mt-1 px-1">
        {data.filter((_, i) => i % labelEvery === 0).map((d, i) => (
          <span key={`${d.label}-${i}`} className="text-[9px] text-body/70">{d.label}</span>
        ))}
      </div>
    </div>
  )
}

function ShareBar({ value, max, color = 'bg-peach-deep' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full h-1.5 bg-hairline rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n)

// ─── Toasts ───

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    toasts.forEach(t => {
      const el = itemRefs.current.get(t.id)
      if (!el || el.dataset.animated === '1') return
      el.dataset.animated = '1'
      gsap.fromTo(el, { opacity: 0, x: 60, scale: 0.94 }, { opacity: 1, x: 0, scale: 1, duration: 0.35, ease: 'back.out(1.2)' })
    })
  }, [toasts])

  const handleDismiss = (id: number) => {
    const el = itemRefs.current.get(id)
    if (el) {
      gsap.to(el, { opacity: 0, x: 60, scale: 0.94, duration: 0.22, ease: 'power2.in', onComplete: () => dismiss(id) })
    } else {
      dismiss(id)
    }
  }

  return (
    <div className="fixed bottom-24 right-5 z-[100] flex flex-col-reverse gap-2.5 pointer-events-none" style={{ maxWidth: '380px' }}>
      {toasts.map(t => {
        const s = TOAST_STYLES[t.type]
        return (
          <div key={t.id} ref={el => { if (el) itemRefs.current.set(t.id, el) }} data-toast-id={t.id}
            className={`pointer-events-auto ${s.bg} ${s.border} border border-hairline rounded-xl shadow-lg p-3.5 flex items-start gap-2.5 min-w-[280px] max-w-[380px]`}>
            <span className={`material-symbols-outlined ${s.iconFill} mt-0.5 shrink-0`} style={{ fontVariationSettings: "'FILL' 1", fontSize: '18px' }}>{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink">{t.title}</div>
              <div className="text-[11px] text-body mt-0.5 leading-relaxed break-words whitespace-pre-line">{t.message}</div>
            </div>
            <button onClick={() => handleDismiss(t.id)} className="text-body/40 hover:text-ink transition-colors shrink-0 mt-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>close</span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Inputs ───

function CustomSelect({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className={`relative ${open ? 'z-[5000]' : 'z-10'}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full h-10 bg-canvas-soft border border-hairline rounded-lg px-3 text-xs text-ink flex items-center justify-between focus:outline-none hover:border-hairline-strong transition-colors cursor-pointer">
        <span className={selected ? 'text-ink' : 'text-body/60'}>{selected?.label || placeholder || 'Select...'}</span>
        <span className={`material-symbols-outlined text-body text-[16px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && (
        <div className="custom-select-dropdown absolute top-full left-0 right-0 mt-1 bg-white border border-hairline rounded-lg shadow-lg z-[6000] overflow-hidden">
          {options.map(opt => (
            <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full px-3 py-2 text-xs text-left transition-colors ${opt.value === value ? 'bg-canvas-soft text-ink font-medium' : 'text-body hover:bg-canvas-soft hover:text-ink'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CustomInput({ value, onChange, placeholder, type = 'text', className = '', mono = false }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; className?: string; mono?: boolean
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full bg-canvas-soft border border-hairline text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-hairline-strong focus:bg-white transition-colors placeholder:text-body/50 ${mono ? 'font-mono' : ''} ${className}`} />
  )
}

// ─── Main App ───

export default function App() {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('qodergate_lang')
    if (stored === 'en' || stored === 'zh') return stored
    return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  })
  const [token, setToken] = useState<string | null>(localStorage.getItem('gateway_token'))
  const [authError, setAuthError] = useState<string | null>(null)
  const [inputToken, setInputToken] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [loginSuccess, setLoginSuccess] = useState(false)

  const [activeTab, setActiveTab] = useState<AppTabId>('dashboard')
  const [status, setStatus] = useState<UIStatus>({ ready: false, mode: 'none', username: null, uid: null, user_type: null, error: null, accounts_count: 0 })
  const [accountsConfig, setAccountsConfig] = useState<AccountsConfig>({ accounts: [], active_uid: null })
  const [apiConfig, setApiConfig] = useState<APIConfig>({ auth_required: false, allowed_keys: [] })
  const [logs, setLogs] = useState<string[]>([])

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am the QoderGate AI assistant. Ask me anything — I support Markdown and LaTeX math.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [model, setModel] = useState('auto')
  const [stream, setStream] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const [newKey, setNewKey] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [searchAccounts, setSearchAccounts] = useState('')
  const [accountFilter, setAccountFilter] = useState<'all' | 'active' | 'error' | 'disabled'>('all')
  const [accountSort, setAccountSort] = useState<'default' | 'quota' | 'expiry'>('default')
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchJson, setBatchJson] = useState('')
  const [refreshingTokens, setRefreshingTokens] = useState(false)
  const [quotaList, setQuotaList] = useState<QuotaEntry[] | null>(null)

  const [usageData, setUsageData] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [deviceFlow, setDeviceFlow] = useState<{ flow_id: string; auth_url: string } | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<'idle' | 'pending' | 'success' | 'error' | 'expired'>('idle')
  const [deviceError, setDeviceError] = useState<string | null>(null)
  const [deviceRemaining, setDeviceRemaining] = useState(0)
  const [modelsError, setModelsError] = useState(false)

  const [modelSeries, setModelSeries] = useState('全部')
  const [modelCaps, setModelCaps] = useState<string[]>([])
  const [modelQuery, setModelQuery] = useState('')

  const [logFilterAccount, setLogFilterAccount] = useState('all')
  const [logFilterStatus, setLogFilterStatus] = useState('all')
  const [logFilterRange, setLogFilterRange] = useState('24h')

  const [regStatus, setRegStatus] = useState<RegStatus | null>(null)
  const [regStarting, setRegStarting] = useState(false)
  const [regStopping, setRegStopping] = useState(false)
  const [regCount, setRegCount] = useState(1)

  const switchLang = (next: Lang) => {
    setLang(next)
    localStorage.setItem('qodergate_lang', next)
  }
  const t = UI_TEXT[lang]
  const msg = {
    imported: (name: string) => lang === 'zh' ? `已导入账号：${name}` : `Imported account: ${name}`,
    importFailed: lang === 'zh' ? '导入失败' : 'Import Failed',
    activated: (uid: string) => lang === 'zh' ? `已切换到账号 ${uid.substring(0, 12)}...` : `Switched active account to ${uid.substring(0, 12)}...`,
    activationFailed: lang === 'zh' ? '激活失败' : 'Activation Failed',
    updated: (enabled: boolean) => lang === 'zh' ? `账号已${enabled ? '启用' : '禁用'}` : `Account ${enabled ? 'enabled' : 'disabled'}`,
    toggleFailed: lang === 'zh' ? '更新失败' : 'Toggle Failed',
    deleted: (uid: string) => lang === 'zh' ? `已删除账号 ${uid.substring(0, 12)}...` : `Removed account ${uid.substring(0, 12)}... from pool`,
    deleteFailed: lang === 'zh' ? '删除失败' : 'Delete Failed',
    configFailed: lang === 'zh' ? '配置保存失败' : 'Config Save Failed',
    authToggled: (enabled: boolean) => lang === 'zh' ? `API Key 鉴权已${enabled ? '开启' : '关闭'}` : `API key validation ${enabled ? 'enabled' : 'disabled'}`,
    keyGenerated: lang === 'zh' ? '已生成新的 API Key，点击添加后生效。' : 'A new API key has been generated. Click Add to activate it.',
    duplicateKey: lang === 'zh' ? '这个 API Key 已存在' : 'This API key already exists in the list',
    keyAdded: lang === 'zh' ? 'API Key 已添加' : 'New API key has been added to the gateway',
    keyRemoved: lang === 'zh' ? 'API Key 已删除' : 'API key has been removed from the gateway',
    copied: lang === 'zh' ? '已复制到剪贴板' : 'Copied to clipboard',
    refreshed: lang === 'zh' ? '状态已刷新' : 'Status Refreshed',
    aiFailed: lang === 'zh' ? 'AI 请求失败' : 'AI Request Failed',
    responseDone: lang === 'zh' ? '响应已完成' : 'Response Complete',
    connectionError: lang === 'zh' ? '连接失败' : 'Connection Error',
  }
  const navLabels: Record<AppTabId, string> = {
    dashboard: t.nav.dashboard,
    accounts: t.nav.accounts,
    models: t.nav.models,
    usage: t.nav.usage,
    playground: t.nav.playground,
    'api-keys': t.nav.apiKeys,
    register: t.nav.register,
    logs: t.nav.logs,
  }
  const navShort: Record<AppTabId, string> = {
    dashboard: lang === 'zh' ? '控制台' : 'Home',
    accounts: lang === 'zh' ? '账号池' : 'Accounts',
    models: lang === 'zh' ? '模型' : 'Models',
    usage: lang === 'zh' ? '用量' : 'Usage',
    playground: lang === 'zh' ? '调试' : 'Play',
    'api-keys': lang === 'zh' ? '密钥' : 'Keys',
    register: lang === 'zh' ? '注册' : 'Registrar',
    logs: lang === 'zh' ? '日志' : 'Logs',
  }
  const pageMeta: Record<AppTabId, { bc: string; title: string; subtitle: string }> = {
    dashboard: { bc: t.breadcrumb.dashboard, title: t.title.dashboard, subtitle: t.subtitle.dashboard },
    accounts: { bc: t.breadcrumb.accounts, title: t.title.accounts, subtitle: t.subtitle.accounts },
    models: { bc: t.breadcrumb.models, title: t.title.models, subtitle: t.subtitle.models },
    usage: { bc: t.breadcrumb.usage, title: t.title.usage, subtitle: t.subtitle.usage },
    playground: { bc: t.breadcrumb.playground, title: t.title.playground, subtitle: t.subtitle.playground },
    'api-keys': { bc: t.breadcrumb.apiKeys, title: t.title.apiKeys, subtitle: t.subtitle.apiKeys },
    register: { bc: t.breadcrumb.register, title: t.title.register, subtitle: t.subtitle.register },
    logs: { bc: t.breadcrumb.logs, title: t.title.logs, subtitle: t.subtitle.logs },
  }

  const loginCardRef = useRef<HTMLDivElement>(null)
  const contentBodyRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const statCardsRef = useRef<HTMLDivElement>(null)

  // Toast state
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastIdRef = useRef(0)
  const pushToast = useCallback((type: ToastType, title: string, message: string) => {
    const id = ++toastIdRef.current
    setToasts(prev => [...prev, { id, type, title, message }])
    setTimeout(() => {
      setToasts(prev => {
        const el = document.querySelector(`[data-toast-id="${id}"]`)
        if (el) {
          gsap.to(el, { opacity: 0, x: 60, scale: 0.94, duration: 0.22, ease: 'power2.in' })
          setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 240)
        } else {
          return prev.filter(t => t.id !== id)
        }
        return prev
      })
    }, 4500)
  }, [])
  const dismissToast = useCallback((id: number) => setToasts(prev => prev.filter(t => t.id !== id)), [])

  const authedFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const headers = { ...(options.headers || {}), 'X-Gateway-Token': token || '' }
    const resp = await fetch(url, { ...options, headers })
    if (resp.status === 401) { localStorage.removeItem('gateway_token'); setToken(null); throw new Error('Unauthorized') }
    return resp
  }, [token])

  const fetchStatus = useCallback(async () => {
    try { const resp = await authedFetch('/ui/status'); const data = await resp.json(); setStatus(data) } catch { /* */ }
  }, [authedFetch])
  const fetchAccounts = useCallback(async () => {
    try { const resp = await authedFetch('/ui/accounts'); const data = await resp.json(); setAccountsConfig(data) } catch { /* */ }
  }, [authedFetch])
  const fetchUsageOverview = useCallback(async () => {
    try {
      const resp = await authedFetch('/ui/usage-overview')
      const data = await resp.json()
      if (data.ok) setUsageData(data)
    } catch { /* */ }
  }, [authedFetch])
  const fetchUsageStats = useCallback(async () => {
    try {
      const resp = await authedFetch('/ui/usage/stats?days=14')
      const data = await resp.json()
      if (data.ok) setUsageStats(data)
    } catch { /* */ }
  }, [authedFetch])
  const fetchModels = useCallback(async () => {
    try {
      const resp = await fetch('/v1/models')
      const data = await resp.json()
      const list = (data?.data || []).map(mapModel).filter((m: ModelInfo) => m.id)
      setModels(list)
      setModelsError(list.length === 0)
    } catch {
      setModelsError(true)
    }
  }, [])

  const handleClaimDaily = async () => {
    setClaiming(true)
    try {
      const resp = await authedFetch('/ui/claim', { method: 'POST' })
      const data = await resp.json()
      if (data.ok) {
        const msgStr = data.results?.map((r: any) => `${r.name}: ${r.message}`).join('\n') || (lang === 'zh' ? '签到打卡完成！' : 'Check-in completed!')
        pushToast('SUCCESS', lang === 'zh' ? '每日签到' : 'Daily Check-in', msgStr)
        fetchUsageOverview()
      } else {
        pushToast('ERROR', lang === 'zh' ? '签到失败' : 'Failed', data.error || '')
      }
    } catch (e: any) {
      pushToast('ERROR', 'Error', e.message)
    } finally {
      setClaiming(false)
    }
  }

  const fetchApiConfig = useCallback(async () => {
    try { const resp = await authedFetch('/ui/config'); const data = await resp.json(); setApiConfig(data) } catch { /* */ }
  }, [authedFetch])

  const doBatchImport = useCallback(async () => {
    let records: unknown
    try { records = JSON.parse(batchJson) } catch { pushToast('ERROR', lang === 'zh' ? 'JSON 解析失败' : 'Invalid JSON', ''); return }
    const arr = Array.isArray(records) ? records : (records as { accounts?: unknown[] }).accounts || []
    if (arr.length === 0) { pushToast('ERROR', lang === 'zh' ? '数组为空' : 'Empty array', ''); return }
    try {
      const resp = await authedFetch('/ui/accounts/batch-import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts: arr }),
      })
      const data = await resp.json()
      if (data.status === 'ok') {
        pushToast('SUCCESS', lang === 'zh' ? `导入 ${data.imported} 个账号` : `Imported ${data.imported}`, lang === 'zh' ? `跳过 ${data.skipped}` : `skipped ${data.skipped}`)
        setBatchJson(''); setShowBatchImport(false); setShowAddAccount(false); fetchAccounts(); fetchStatus()
      } else { pushToast('ERROR', lang === 'zh' ? '导入失败' : 'Import failed', data.detail || '') }
    } catch { pushToast('ERROR', lang === 'zh' ? '导入失败' : 'Import failed', '') }
  }, [authedFetch, batchJson, lang, fetchAccounts, fetchStatus, pushToast])

  const doRefreshTokens = useCallback(async () => {
    setRefreshingTokens(true)
    try {
      const resp = await authedFetch('/ui/accounts/refresh-tokens', { method: 'POST' })
      const data = await resp.json()
      if (data.status === 'ok') {
        pushToast('SUCCESS', lang === 'zh' ? `刷新完成 ${data.ok}/${data.total}` : `Refreshed ${data.ok}/${data.total}`, lang === 'zh' ? `失败 ${data.failed}` : `failed ${data.failed}`)
        fetchAccounts()
      } else { pushToast('ERROR', lang === 'zh' ? '刷新失败' : 'Refresh failed', data.error || '') }
    } catch { pushToast('ERROR', lang === 'zh' ? '刷新失败' : 'Refresh failed', '') } finally { setRefreshingTokens(false) }
  }, [authedFetch, lang, pushToast, fetchAccounts])

  const loadQuota = useCallback(async () => {
    try {
      const resp = await authedFetch('/ui/accounts/quota')
      const data = await resp.json()
      setQuotaList(data.quotas || [])
    } catch { pushToast('ERROR', lang === 'zh' ? '限额查询失败' : 'Quota query failed', '') }
  }, [authedFetch, lang, pushToast])

  const fetchLogs = useCallback(async () => {
    try { const resp = await authedFetch('/ui/logs'); const data = await resp.json(); setLogs(data) } catch { /* */ }
  }, [authedFetch])
  const fetchRegStatus = useCallback(async () => {
    try { const resp = await authedFetch('/ui/registrar/status'); const data = await resp.json(); setRegStatus(data) } catch { /* */ }
  }, [authedFetch])

  const startRegister = useCallback(async () => {
    if (regStatus?.running) return
    setRegStarting(true)
    try {
      const resp = await authedFetch('/ui/registrar/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parents: regCount }),
      })
      const data = await resp.json()
      if (data.ok) {
        pushToast('INFO', lang === 'zh' ? '注册已开始（无限循环）' : 'Registration started (looping)', lang === 'zh' ? `${data.parents} 个母线程，每个 3 子任务并发，请完成置顶的人机验证` : `${data.parents} parent threads x 3 workers, complete the topmost human verification`)
        fetchRegStatus()
      } else {
        pushToast('ERROR', lang === 'zh' ? '启动失败' : 'Start failed', data.error || '')
      }
    } catch { pushToast('ERROR', lang === 'zh' ? '启动失败' : 'Start failed', '') } finally { setRegStarting(false) }
  }, [authedFetch, fetchRegStatus, pushToast, regStatus?.running, lang, regCount])

  const stopRegister = useCallback(async () => {
    if (!regStatus?.running || regStopping) return
    setRegStopping(true)
    try {
      const resp = await authedFetch('/ui/registrar/stop', { method: 'POST' })
      const data = await resp.json()
      if (data.ok) {
        pushToast('INFO', lang === 'zh' ? '停止请求已发送' : 'Stop requested', lang === 'zh' ? '当前批次完成后停止' : 'Stops after the current batch')
      } else {
        pushToast('ERROR', lang === 'zh' ? '取消失败' : 'Stop failed', data.error || '')
      }
    } catch { pushToast('ERROR', lang === 'zh' ? '取消失败' : 'Stop failed', '') } finally { setRegStopping(false) }
  }, [authedFetch, pushToast, regStatus?.running, regStopping, lang])

  useEffect(() => {
    if (!token) return
    fetchStatus(); fetchAccounts(); fetchApiConfig(); fetchUsageOverview(); fetchUsageStats(); fetchModels(); fetchLogs(); fetchRegStatus(); loadQuota()
    const si = setInterval(fetchStatus, 6000)
    const ui = setInterval(fetchUsageStats, 30000)
    const li = setInterval(() => { if (activeTab === 'logs') fetchLogs() }, 3000)
    const ri = setInterval(() => { if (activeTab === 'register' && regStatus?.running) fetchRegStatus() }, 2000)
    return () => { clearInterval(si); clearInterval(ui); clearInterval(li); clearInterval(ri) }
  }, [token, activeTab, fetchStatus, fetchAccounts, fetchApiConfig, fetchUsageOverview, fetchUsageStats, fetchModels, fetchLogs, fetchRegStatus, loadQuota, regStatus?.running])

  useEffect(() => { if (activeTab === 'logs') logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs, activeTab])
  useEffect(() => { if (activeTab === 'playground') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages, activeTab])

  useEffect(() => {
    if (!deviceFlow || deviceStatus !== 'pending') return
    let cancelled = false
    const tick = async () => {
      try {
        const resp = await authedFetch(`/ui/accounts/device/status?flow_id=${deviceFlow.flow_id}`)
        const data = await resp.json()
        if (cancelled) return
        if (typeof data.remaining === 'number') setDeviceRemaining(data.remaining)
        if (data.status === 'success') {
          setDeviceStatus('success')
          pushToast('SUCCESS', lang === 'zh' ? '账号已添加' : 'Account added', data.account?.name || '')
          setShowAddAccount(false)
          setShowBatchImport(false)
          setDeviceFlow(null)
          setDeviceStatus('idle')
          fetchAccounts(); fetchStatus(); fetchUsageOverview(); loadQuota()
        } else if (data.status === 'error' || data.status === 'expired') {
          setDeviceStatus(data.status)
          setDeviceError(data.error || '')
        }
      } catch { /* keep polling */ }
    }
    const timer = setInterval(tick, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [deviceFlow, deviceStatus, authedFetch, lang, pushToast, fetchAccounts, fetchStatus, fetchUsageOverview, loadQuota])

  // GSAP
  useEffect(() => { if (!token && loginCardRef.current) gsap.fromTo(loginCardRef.current, { scale: 0.94, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' }) }, [token])
  useEffect(() => { if (token && contentBodyRef.current) gsap.fromTo(contentBodyRef.current, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' }) }, [activeTab, token])
  useEffect(() => {
    if (token && activeTab === 'dashboard' && statCardsRef.current) {
      const cards = statCardsRef.current.querySelectorAll('.stat-card')
      gsap.fromTo(cards, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.42, stagger: 0.06, ease: 'power2.out' })
    }
  }, [activeTab, token])

  // ─── Handlers ───

  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputToken.trim()
    if (!trimmed) return
    setVerifying(true); setAuthError(null)
    try {
      const resp = await fetch('/ui/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: trimmed }) })
      if (resp.ok) {
        setLoginSuccess(true)
        if (loginCardRef.current) {
          gsap.to(loginCardRef.current, { scale: 1.02, duration: 0.28, ease: 'power2.out', onComplete: () => { localStorage.setItem('gateway_token', trimmed); setToken(trimmed); setInputToken('') } })
        }
      } else {
        if (loginCardRef.current) gsap.to(loginCardRef.current, { x: 8, duration: 0.04, repeat: 7, yoyo: true, onComplete: () => gsap.set(loginCardRef.current!, { x: 0 }) })
        setAuthError(lang === 'zh' ? '访问密钥无效' : 'Invalid gateway access token')
      }
    } catch (err: any) { setAuthError(`${lang === 'zh' ? '连接失败' : 'Connection failed'}: ${err.message}`) } finally { setVerifying(false) }
  }

  const handleLogout = () => { localStorage.removeItem('gateway_token'); setToken(null); setLoginSuccess(false) }

  const handleImportAuth = async () => {
    try {
      const resp = await authedFetch('/ui/accounts/import', { method: 'POST' })
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Import failed') }
      const data = await resp.json()
      pushToast('SUCCESS', lang === 'zh' ? '账号已导入' : 'Account Imported', msg.imported(data.account?.name || (lang === 'zh' ? '本地会话' : 'local session')))
      setShowAddAccount(false)
      fetchAccounts(); fetchStatus(); fetchLogs(); loadQuota()
    } catch (err: any) {
      pushToast(
        'ERROR',
        msg.importFailed,
        `${err.message}\n${lang === 'zh'
          ? '本机导入需要服务器上已登录 Qoder 客户端。手机上没有该凭据，请改用「通过 Qoder 登录页添加」。'
          : 'Local import needs a signed-in Qoder client on this server. Use “Sign in on Qoder” instead.'}`,
      )
    }
  }

  const startDeviceLogin = async () => {
    setDeviceError(null)
    setDeviceStatus('pending')
    try {
      const resp = await authedFetch('/ui/accounts/device/start', { method: 'POST' })
      const data = await resp.json()
      if (!data.ok) throw new Error(data.error || 'Failed to start login')
      setDeviceFlow({ flow_id: data.flow_id, auth_url: data.auth_url })
      setDeviceRemaining(Number(data.expires_in) || 300)
      window.open(data.auth_url, '_blank', 'noopener')
      setDeviceStatus('pending')
    } catch (e: any) {
      setDeviceStatus('error')
      setDeviceError(e.message)
    }
  }

  const closeAddAccount = () => {
    setShowAddAccount(false)
    setShowBatchImport(false)
    setDeviceFlow(null)
    setDeviceStatus('idle')
    setDeviceError(null)
    setDeviceRemaining(0)
  }

  const handleSelectAccount = async (uid: string) => {
    try {
      const resp = await authedFetch('/ui/accounts/select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) })
      if (!resp.ok) throw new Error('Switch failed')
      pushToast('INFO', lang === 'zh' ? '账号已激活' : 'Account Activated', msg.activated(uid))
      fetchAccounts(); fetchStatus(); fetchLogs()
    } catch (err: any) { pushToast('ERROR', msg.activationFailed, err.message) }
  }

  const handleToggleAccount = async (uid: string, enabled: boolean) => {
    try {
      const resp = await authedFetch('/ui/accounts/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, enabled }) })
      if (!resp.ok) throw new Error('Toggle failed')
      pushToast('INFO', lang === 'zh' ? '账号已更新' : 'Account Updated', msg.updated(enabled))
      fetchAccounts(); fetchStatus()
    } catch (err: any) { pushToast('ERROR', msg.toggleFailed, err.message) }
  }

  const handleDeleteAccount = async (uid: string) => {
    if (!confirm(lang === 'zh' ? '确定从账号池删除该账号？' : 'Delete this account from the database?')) return
    try {
      const resp = await authedFetch(`/ui/accounts/${uid}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Delete failed')
      pushToast('SUCCESS', lang === 'zh' ? '账号已删除' : 'Account Deleted', msg.deleted(uid))
      fetchAccounts(); fetchStatus(); fetchLogs(); loadQuota()
    } catch (err: any) { pushToast('ERROR', msg.deleteFailed, err.message) }
  }

  const handleSaveApiConfig = async (newConfig: APIConfig) => {
    try {
      await authedFetch('/ui/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newConfig) })
      setApiConfig(newConfig)
    } catch { pushToast('ERROR', msg.configFailed, lang === 'zh' ? '无法更新 API 配置' : 'Could not update API configuration') }
  }

  const handleToggleAuth = () => {
    const updated = { ...apiConfig, auth_required: !apiConfig.auth_required }
    handleSaveApiConfig(updated)
    pushToast('INFO', lang === 'zh' ? '鉴权状态已更新' : 'Auth Toggled', msg.authToggled(!apiConfig.auth_required))
  }

  const handleGenerateKey = () => {
    const random = 'qg_live_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')
    setNewKey(random)
    pushToast('INFO', lang === 'zh' ? 'Key 已生成' : 'Key Generated', msg.keyGenerated)
  }

  const handleAddKey = () => {
    const trimmed = newKey.trim()
    if (!trimmed) return
    if (apiConfig.allowed_keys.includes(trimmed)) { pushToast('ERROR', lang === 'zh' ? 'Key 已存在' : 'Duplicate Key', msg.duplicateKey); return }
    handleSaveApiConfig({ ...apiConfig, allowed_keys: [...apiConfig.allowed_keys, trimmed] })
    pushToast('SUCCESS', lang === 'zh' ? 'Key 已添加' : 'Key Added', msg.keyAdded)
    setNewKey('')
  }

  const handleDeleteKey = (key: string) => {
    handleSaveApiConfig({ ...apiConfig, allowed_keys: apiConfig.allowed_keys.filter(k => k !== key) })
    pushToast('SUCCESS', lang === 'zh' ? 'Key 已删除' : 'Key Removed', msg.keyRemoved)
  }

  const handleCopyKey = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    pushToast('INFO', lang === 'zh' ? '已复制' : 'Copied', msg.copied)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRefreshStatus = () => {
    fetchAccounts(); fetchStatus(); fetchLogs(); loadQuota()
    pushToast('INFO', msg.refreshed, lang === 'zh' ? '账号池和系统状态已更新' : 'Account pool and system status updated')
  }

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = chatInput.trim()
    if (!trimmed || generating) return
    setChatMessages(prev => [...prev, { role: 'user', content: trimmed }])
    setChatInput(''); setGenerating(true)
    setChatMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiConfig.auth_required && apiConfig.allowed_keys.length > 0) headers['Authorization'] = `Bearer ${apiConfig.allowed_keys[0]}`

    try {
      const response = await fetch('/v1/chat/completions', { method: 'POST', headers, body: JSON.stringify({ model, messages: [{ role: 'user', content: trimmed }], stream }) })
      if (!response.ok) {
        const errData = await response.json()
        const errMsg = errData.detail || errData.error?.message || response.statusText
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `Request failed: ${errMsg}` }; return u })
        pushToast('ERROR', msg.aiFailed, errMsg)
        setGenerating(false); return
      }
      if (stream) {
        const reader = response.body?.getReader()
        if (!reader) throw new Error('No stream reader')
        const decoder = new TextDecoder('utf-8')
        let buffer = ''; let currentResponse = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n'); buffer = lines.pop() || ''
          for (const line of lines) {
            const tl = line.trim()
            if (!tl.startsWith('data:')) continue
            const rawData = tl.slice(5).trim()
            if (rawData === '[DONE]') continue
            try {
              const parsed = JSON.parse(rawData)
              const chunk = parsed.choices?.[0]?.delta?.content || ''
              currentResponse += chunk
              setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: currentResponse }; return u })
            } catch { /* */ }
          }
        }
        pushToast('SUCCESS', msg.responseDone, lang === 'zh' ? '流式响应已结束' : 'AI response stream finished successfully')
      } else {
        const data = await response.json()
        const ans = data.choices?.[0]?.message?.content || ''
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: ans }; return u })
        pushToast('SUCCESS', msg.responseDone, lang === 'zh' ? '已收到 AI 响应' : 'AI response received successfully')
      }
      fetchUsageStats()
    } catch (err: any) {
      setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: `Connection error: ${err.message}` }; return u })
      pushToast('ERROR', msg.connectionError, err.message)
    } finally { setGenerating(false) }
  }

  const renderMessageContent = (text: string) => {
    const thinkingRegex = /<thinking>([\s\S]*?)(?:<\/thinking>|$)/
    const match = text.match(thinkingRegex)
    if (match) {
      const thinking = match[1]; const response = text.replace(thinkingRegex, '').trim()
      return (
        <div className="space-y-3">
          <div className="card-soft overflow-hidden">
            <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-body hover:text-ink transition-colors">
              <span className="material-symbols-outlined text-[16px]">psychology</span>Thinking Process
              <span className={`material-symbols-outlined text-[16px] ml-auto transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
            </button>
            {isExpanded && <div className="px-3.5 py-2.5 text-[11px] text-body italic leading-relaxed border-t border-hairline whitespace-pre-wrap">{thinking}</div>}
          </div>
          {response && <div className="prose prose-stone max-w-none text-sm leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{response}</ReactMarkdown></div>}
        </div>
      )
    }
    return <div className="prose prose-stone max-w-none text-sm leading-relaxed"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{text}</ReactMarkdown></div>
  }

  const getLogLevel = (log: string) => (log.match(/\[(INFO|ERROR|WARNING)\]/)?.[1] || 'INFO').toLowerCase()
  const getLogMinutes = (log: string) => {
    const match = log.match(/^\[(\d{2}):(\d{2}):(\d{2})\]/)
    if (!match) return null
    return Number(match[1]) * 60 + Number(match[2])
  }
  const getLogAccount = (log: string) => {
    const routed = log.match(/Request routing via account:\s*(.+?)\s*\(([^)]+)\)/)
    if (routed) return routed[2]
    const failed = log.match(/Request failed on account\s+([^:]+):/)
    if (failed) return failed[1]
    return null
  }
  const accountLogOptions = [
    { value: 'all', label: t.logs.allAccounts },
    ...Array.from(new Set([
      ...accountsConfig.accounts.map(acc => acc.uid),
      ...logs.map(getLogAccount).filter((uid): uid is string => Boolean(uid))
    ])).map(uid => ({ value: uid, label: accountsConfig.accounts.find(acc => acc.uid === uid)?.name || uid }))
  ]
  const filteredLogs = logs.filter(log => {
    if (logFilterStatus !== 'all' && getLogLevel(log) !== logFilterStatus) return false
    if (logFilterAccount !== 'all' && getLogAccount(log) !== logFilterAccount) return false
    if (logFilterRange === '1h') {
      const minutes = getLogMinutes(log)
      if (minutes === null) return false
      const now = new Date()
      const nowMinutes = now.getHours() * 60 + now.getMinutes()
      const diff = (nowMinutes - minutes + 1440) % 1440
      return diff <= 60
    }
    return true
  })

  // ─── LOGIN ───
  if (!token) {
    return (
      <div className="bg-surface text-ink min-h-screen flex items-center justify-center p-4">
        <main ref={loginCardRef} className="w-full max-w-[400px]">
          <div className="card p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-11 h-11 bg-ink rounded-xl flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-white text-[21px]" style={{ fontVariationSettings: "'FILL' 1" }}>gate</span>
              </div>
              <h1 className="font-display-lg text-ink">QoderGate</h1>
              <p className="text-[11px] text-body mt-1 uppercase tracking-[0.18em]">{lang === 'zh' ? '管理控制台' : 'Management Console'}</p>
            </div>
            <form className="space-y-4" onSubmit={handleVerifyToken}>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ink">{lang === 'zh' ? '网关访问密钥' : 'Gateway Access Token'}</label>
                <CustomInput type="password" value={inputToken} onChange={setInputToken} placeholder={lang === 'zh' ? '输入你的安全密钥...' : 'Enter your security token...'} />
              </div>
              {authError && (
                <div className="flex items-center gap-2 p-3 bg-toast-error/10 text-toast-error rounded-lg text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">warning</span>{authError}
                </div>
              )}
              <button className={`w-full py-3 rounded-full transition-colors flex items-center justify-center gap-2 text-sm font-medium ${loginSuccess ? 'bg-mint-deep text-white' : 'bg-ink text-white hover:bg-primary'} disabled:opacity-50`} type="submit" disabled={verifying}>
                {verifying ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>{lang === 'zh' ? '验证中...' : 'Verifying...'}</span></>
                ) : loginSuccess ? (
                  <><span className="material-symbols-outlined text-[18px]">check_circle</span><span>{lang === 'zh' ? '访问已授权' : 'Access Granted'}</span></>
                ) : (
                  <><span>{lang === 'zh' ? '验证密钥' : 'Verify Token'}</span><span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
                )}
              </button>
            </form>
            <button onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')} className="mt-3 w-full text-xs text-body hover:text-ink transition-colors">
              {lang === 'zh' ? 'Switch to English' : '切换到中文'}
            </button>
          </div>
          <div className="mt-4 flex justify-between px-2">
            <span className="text-[10px] text-body">v2.4.0</span>
            <span className="text-[10px] text-body flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-mint-deep"></span>{lang === 'zh' ? '运行中' : 'Operational'}</span>
          </div>
        </main>
      </div>
    )
  }

  // ─── Derived data ───
  const accounts = accountsConfig.accounts
  const activeAccount = accounts.find(a => a.uid === accountsConfig.active_uid)
  const quotaByUid = new Map((quotaList || []).map(q => [q.uid, q]))
  const filteredAccounts = accounts
    .filter(acc => {
      if (searchAccounts) {
        const q = searchAccounts.toLowerCase()
        if (!acc.name.toLowerCase().includes(q) && !acc.uid.toLowerCase().includes(q)) return false
      }
      if (accountFilter === 'active') return acc.enabled && acc.last_status === 'ok' && !acc.is_quota_exceeded
      if (accountFilter === 'error') return acc.last_status !== 'ok' || acc.is_quota_exceeded
      if (accountFilter === 'disabled') return !acc.enabled
      return true
    })
    .sort((a, b) => {
      if (accountSort === 'quota') return (b.quota || 0) - (a.quota || 0)
      if (accountSort === 'expiry') {
        const ta = a.token_expires_at ? new Date(a.token_expires_at).getTime() : 0
        const tb = b.token_expires_at ? new Date(b.token_expires_at).getTime() : 0
        return tb - ta
      }
      return 0
    })

  const filteredModels = models.filter(m => {
    if (modelSeries !== '全部' && m.series !== modelSeries) return false
    if (modelCaps.length > 0) {
      if (modelCaps.includes('支持推理') && !m.efforts.some(e => e !== '自适应')) return false
      if (modelCaps.includes('1M 上下文') && m.contextLength < 1_000_000) return false
      if (modelCaps.includes('免费') && !m.free) return false
    }
    if (modelQuery) {
      const q = modelQuery.toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !m.id.toLowerCase().includes(q) && !m.provider.toLowerCase().includes(q)) return false
    }
    return true
  })
  const modelSeriesOptions = ['全部', ...Array.from(new Set(models.map(m => m.series).filter(Boolean)))]

  const maxContext = models.reduce((max, m) => Math.max(max, m.contextLength), 0)
  const reasoningCount = models.filter(m => m.efforts.some(e => e !== '自适应')).length
  const freeCount = models.filter(m => m.free).length

  const campaigns = usageData?.campaigns?.campaigns || []
  const targetCampaign = campaigns.find((c: any) => c.actionType === 'CLAIM_BENEFIT') || campaigns[0]
  const isClaimed = targetCampaign?.claimStatus === 'CLAIMED'
  const planQuota = usageData?.quota?.userQuota || null
  const addOnQuota = usageData?.quota?.addOnQuota || null
  const combinedPlanQuota = planQuota
    ? {
        total: (planQuota.total || 0) + (addOnQuota?.total || 0),
        used: (planQuota.used || 0) + (addOnQuota?.used || 0),
        remaining: (planQuota.remaining || 0) + (addOnQuota?.remaining || 0),
      }
    : null
  const planUsedPct = planQuota && planQuota.total ? Math.min(100, Math.round(((planQuota.used || 0) / planQuota.total) * 100)) : null
  const expiresAt = usageData?.quota?.expiresAt ? new Date(usageData.quota.expiresAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US') : null
  const userType = usageData?.quota?.userType || null
  const canClaim = accounts.length > 0

  const page = pageMeta[activeTab]

  // ─── MAIN ───
  return (
    <div className="bg-surface min-h-screen flex flex-col relative overflow-x-hidden">
      {/* Ambient orbs */}
      <div className="orb bg-mint w-[420px] h-[420px] -top-32 -right-24" style={{ opacity: 0.28 }} />
      <div className="orb bg-peach w-[360px] h-[360px] bottom-0 left-[10%]" style={{ opacity: 0.22 }} />

      {/* Top bar */}
      <header className="sticky top-0 z-40 glass-card border-b border-hairline">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>gate</span>
            </div>
            <span className="font-display-sm text-ink leading-none">QoderGate</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')} className="px-2.5 py-1.5 text-[11px] font-medium text-body hover:text-ink hover:bg-canvas-soft rounded-lg transition-colors">
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <a href="/documents" className="px-2.5 py-1.5 text-[11px] font-medium text-body hover:text-ink hover:bg-canvas-soft rounded-lg transition-colors">
              {t.common.docs}
            </a>
            <span className="w-px h-4 bg-hairline mx-1.5"></span>
            <div className="flex items-center gap-1.5 px-2">
              <span className={`w-1.5 h-1.5 rounded-full ${status.ready ? 'bg-mint-deep' : 'bg-toast-error'}`}></span>
              <span className="text-[11px] text-body max-w-[140px] truncate">{activeAccount?.name || status.username || 'QoderGate'}</span>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-body hover:text-toast-error hover:bg-canvas-soft rounded-lg transition-colors" title={t.common.signOut}>
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 pb-28 relative z-10">
        <div ref={contentBodyRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-7">
          {/* Page header */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-medium text-body/70 uppercase tracking-[0.16em] mb-1">{page.bc}</div>
              <h1 className="font-display-lg text-ink leading-none">{page.title}</h1>
              <p className="text-xs text-body mt-2">{page.subtitle}</p>
            </div>
          </div>

          {/* ─── DASHBOARD ─── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-5">
              {/* KPI */}
              <section ref={statCardsRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="stat-card card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-medium text-body uppercase tracking-wide">{t.dashboard.serviceStatus}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.ready ? 'bg-mint-deep' : 'bg-toast-error'}`}></span>
                  </div>
                  <div className="font-display-md text-ink leading-none">{status.ready ? t.common.healthy : t.common.offline}</div>
                  <div className="text-[11px] text-body mt-1.5 truncate">{status.ready ? t.dashboard.allGatewaysActive : t.dashboard.noActiveSession}</div>
                </div>
                <div className="stat-card card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{t.dashboard.accountPool}</div>
                  <div className="font-display-md text-ink leading-none">{accounts.length || status.accounts_count || 0}</div>
                  <div className="text-[11px] text-body mt-1.5 truncate">{accounts.filter(a => a.enabled).length} {lang === 'zh' ? '个启用' : 'enabled'}</div>
                </div>
                <div className="stat-card card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '主配额' : 'Plan Quota'}</div>
                  {planQuota ? (
                    <>
                      <div className="font-display-md text-ink leading-none">{planQuota.remaining}<span className="text-xs text-body font-sans">/{planQuota.total}</span></div>
                      <div className="w-full bg-hairline h-1 rounded-full mt-2 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${planUsedPct !== null && planUsedPct >= 85 ? 'bg-peach-deep' : 'bg-ink'}`} style={{ width: `${Math.max(2, planUsedPct ?? 0)}%` }}></div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-display-md text-body/30 leading-none">—</div>
                      <div className="text-[10px] text-body mt-2">{accounts.length === 0 ? (lang === 'zh' ? '无账号数据' : 'No account') : (lang === 'zh' ? '额度读取失败' : 'Quota unavailable')}</div>
                    </>
                  )}
                </div>
                <div className="stat-card card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '签到算力' : 'Add-on'}</div>
                  {addOnQuota ? (
                    <>
                      <div className="font-display-md text-peach-deep leading-none">{addOnQuota.remaining}</div>
                      <div className="text-[11px] text-body mt-1.5">{lang === 'zh' ? '30 天滚动有效' : '30-day rolling'}</div>
                    </>
                  ) : (
                    <>
                      <div className="font-display-md text-body/30 leading-none">—</div>
                      <div className="text-[10px] text-body mt-2">{lang === 'zh' ? '暂无数据' : 'No data'}</div>
                    </>
                  )}
                </div>
                <div className="stat-card card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '每日签到' : 'Check-in'}</div>
                  {isClaimed ? (
                    <div className="flex items-center gap-1.5 text-mint-deep">
                      <span className="material-symbols-outlined text-[17px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                      <span className="text-sm font-medium">{lang === 'zh' ? '今日已领 100' : 'Claimed 100'}</span>
                    </div>
                  ) : (
                    <button onClick={handleClaimDaily} disabled={claiming || !canClaim}
                      title={!canClaim ? (lang === 'zh' ? '请先添加账号' : 'Add an account first') : undefined}
                      className="w-full px-3 py-1.5 bg-peach-deep text-white text-xs font-medium rounded-full hover:bg-peach-deep/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">card_giftcard</span>
                      {claiming ? '...' : !canClaim ? (lang === 'zh' ? '无可用账号' : 'No account') : (lang === 'zh' ? '打卡领取' : 'Claim')}
                    </button>
                  )}
                  <div className="text-[11px] text-body mt-1.5">{lang === 'zh' ? '每日 10:05 自动' : 'Auto at 10:05'}</div>
                </div>
              </section>

              {/* Trend + account health */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-ink">{lang === 'zh' ? '近 14 天调用趋势' : '14-day request trend'}</div>
                      <div className="text-[10px] text-body mt-0.5">{lang === 'zh' ? '请求数（精确）/ Token（估算）' : 'Requests (exact) / Tokens (estimated)'}</div>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-body">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-peach-deep"></span>{lang === 'zh' ? 'Token' : 'Tokens'}</span>
                      <span className="font-mono">{fmt(usageStats?.daily?.reduce((s, d) => s + d.tokens, 0) || 0)}</span>
                    </div>
                  </div>
                  <AreaChart data={usageStats?.daily || []} valueKey="tokens" height={190} labelEvery={2} />
                </div>

                {/* Account health snapshot - supports multiple accounts */}
                <div className="card p-5 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-ink">{lang === 'zh' ? '账号健康快照' : 'Account health'}</div>
                    <span className="text-[10px] text-body">{accounts.filter(a => a.enabled).length}/{accounts.length} {lang === 'zh' ? '在线' : 'online'}</span>
                  </div>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[220px] pr-0.5">
                    {accounts.length === 0 && (
                      <div className="text-center py-8">
                        <div className="text-[11px] text-body mb-2">{t.accounts.empty}</div>
                        <button onClick={() => setShowAddAccount(true)} className="text-[11px] px-3 py-1.5 bg-ink text-white rounded-full">{t.accounts.importAccounts}</button>
                      </div>
                    )}
                    {accounts.map(acc => {
                      const isActiveAcc = acc.uid === accountsConfig.active_uid
                      const perAccount = quotaByUid.get(acc.uid)?.quota?.userQuota
                      const baseQ = perAccount && perAccount.total ? perAccount : (isActiveAcc ? planQuota : null)
                      const q = baseQ
                        ? (isActiveAcc && addOnQuota
                            ? {
                                total: (baseQ.total || 0) + (addOnQuota.total || 0),
                                used: (baseQ.used || 0) + (addOnQuota.used || 0),
                                remaining: (baseQ.remaining || 0) + (addOnQuota.remaining || 0),
                              }
                            : baseQ)
                        : null
                      const hasDetail = Boolean(q && q.total)
                      const usedPct = hasDetail && q ? Math.min(100, Math.round((q.used / q.total) * 100)) : null
                      const isHealthy = acc.enabled && acc.last_status === 'ok' && !acc.is_quota_exceeded
                      return (
                        <div key={acc.uid} className={`rounded-xl p-3 ${acc.uid === accountsConfig.active_uid ? 'bg-canvas-soft ring-1 ring-hairline-strong' : 'bg-canvas-soft'}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isHealthy ? 'bg-mint-deep' : acc.is_quota_exceeded ? 'bg-peach-deep' : 'bg-hairline-strong'}`}></span>
                              <span className="text-xs font-medium text-ink truncate">{acc.name}</span>
                              {acc.uid === accountsConfig.active_uid && <span className="text-[9px] bg-ink text-white px-1 py-0.5 rounded shrink-0">{lang === 'zh' ? '当前' : 'Active'}</span>}
                            </div>
                            <span className={`text-[10px] shrink-0 ${isHealthy ? 'text-mint-deep' : 'text-peach-deep'}`}>
                              {!acc.enabled ? (lang === 'zh' ? '已停用' : 'Disabled') : acc.is_quota_exceeded ? (lang === 'zh' ? '超额' : 'Exceeded') : isHealthy ? (lang === 'zh' ? '正常' : 'OK') : (lang === 'zh' ? '异常' : 'Error')}
                            </span>
                          </div>
                          {usedPct !== null ? (
                            <div className="mt-2 h-1.5 bg-hairline rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${usedPct > 85 ? 'bg-peach-deep' : 'bg-mint-deep'}`} style={{ width: `${Math.max(2, usedPct)}%` }} />
                            </div>
                          ) : (
                            <div className="mt-2 h-1.5 bg-hairline rounded-full" title={lang === 'zh' ? '暂无额度明细' : 'No quota detail'} />
                          )}
                          <div className="flex items-center justify-between mt-1.5 text-[10px] text-body">
                            <span>{usedPct !== null && q ? `${q.remaining} / ${q.total} Credits` : acc.quota ? (lang === 'zh' ? `记录额度 ${acc.quota}` : `Recorded ${acc.quota}`) : '—'}</span>
                            <span>
                              {acc.next_reset_at
                                ? `${new Date(acc.next_reset_at).toLocaleDateString()} ${lang === 'zh' ? '重置' : 'reset'}`
                                : acc.uid === accountsConfig.active_uid && expiresAt
                                  ? `${lang === 'zh' ? '有效期至' : 'valid'} ${expiresAt}`
                                  : '—'}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <button onClick={() => setShowAddAccount(true)} className="mt-3 w-full py-2 border border-hairline rounded-full text-[11px] font-medium text-ink hover:bg-canvas-soft transition-colors flex items-center justify-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">add</span>{t.accounts.importAccounts}
                  </button>
                </div>
              </section>

              {/* Quota detail */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-body uppercase tracking-wide">{lang === 'zh' ? '主套餐月度配额' : 'Plan quota'}</span>
                    <span className="text-[10px] font-medium text-ink">{planUsedPct !== null ? `${planUsedPct}%` : '—'}</span>
                  </div>
                  {planQuota ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="font-display-md text-ink leading-none">{planQuota.remaining}</span>
                        <span className="text-[11px] text-body">/ {planQuota.total} Credits</span>
                      </div>
                      <div className="w-full bg-hairline h-1.5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${planUsedPct !== null && planUsedPct >= 85 ? 'bg-peach-deep' : 'bg-ink'}`} style={{ width: `${Math.max(2, planUsedPct ?? 0)}%` }}></div>
                      </div>
                      <div className="flex justify-between mt-3 text-[10px] text-body">
                        <span>{lang === 'zh' ? '已用' : 'Used'} {planQuota.used}</span>
                        <span className={`font-medium ${planUsedPct !== null && planUsedPct >= 95 ? 'text-toast-error' : planUsedPct !== null && planUsedPct >= 85 ? 'text-peach-deep' : 'text-mint-deep'}`}>
                          {planUsedPct === null ? '—' : planUsedPct >= 95 ? (lang === 'zh' ? '已耗尽' : 'Exhausted') : planUsedPct >= 85 ? (lang === 'zh' ? '即将耗尽' : 'Low') : (lang === 'zh' ? '充足' : 'Healthy')}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="font-display-md text-body/30 leading-none">—</span>
                        <span className="text-[11px] text-body">Credits</span>
                      </div>
                      <p className="text-[11px] text-body leading-relaxed">
                        {accounts.length === 0
                          ? (lang === 'zh' ? '尚未添加账号，无法读取配额。' : 'Add an account to read quota.')
                          : (lang === 'zh' ? '配额接口暂不可用，请稍后刷新。' : 'Quota is unavailable, try refreshing.')}
                      </p>
                      <div className="flex justify-end mt-3">
                        <button onClick={fetchUsageOverview} className="text-[10px] text-body hover:text-ink flex items-center gap-0.5 transition-colors">
                          <span className="material-symbols-outlined text-[13px]">sync</span>{t.common.refresh}
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-medium text-body uppercase tracking-wide">{lang === 'zh' ? '通用签到算力' : 'Add-on credits'}</span>
                    <span className="text-[10px] font-medium text-peach-deep">{lang === 'zh' ? '30 天滚动' : '30-day'}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="font-display-md text-peach-deep leading-none">{addOnQuota ? addOnQuota.remaining : '—'}</span>
                    <span className="text-[11px] text-body">Credits</span>
                  </div>
                  <p className="text-[11px] text-body leading-relaxed">
                    {addOnQuota
                      ? (lang === 'zh' ? '每日签到赠送，优先级最高抵扣，持续打卡储备算力。' : 'Daily check-in rewards, highest priority deduction.')
                      : (lang === 'zh' ? '暂无数据。' : 'No data yet.')}
                  </p>
                </div>
                <div className="card p-5 flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '账号权限与有效期' : 'Account plan'}</div>
                    <div className={`text-sm font-medium ${userType ? 'text-ink' : 'text-body/40'}`}>
                      {userType
                        ? (userType === 'personal_professional_trial' ? (lang === 'zh' ? '个人专业试用版' : 'Pro Trial') : userType)
                        : '—'}
                    </div>
                    <div className="text-[11px] text-body mt-1.5">{lang === 'zh' ? '有效期至' : 'Valid until'} <span className="font-mono text-ink">{expiresAt || '—'}</span></div>
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-hairline">
                    <span className={`flex items-center gap-1 text-[10px] font-medium ${userType ? 'text-mint-deep' : 'text-body/60'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${userType ? 'bg-mint-deep' : 'bg-hairline-strong'}`}></span>
                      {userType ? (lang === 'zh' ? '已连接' : 'Connected') : (lang === 'zh' ? '未连接' : 'Not connected')}
                    </span>
                    <button onClick={fetchUsageOverview} className="text-[10px] text-body hover:text-ink flex items-center gap-0.5 transition-colors">
                      <span className="material-symbols-outlined text-[13px]">sync</span>{t.common.refresh}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ─── ACCOUNTS ─── */}
          {activeTab === 'accounts' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <section className="flex flex-wrap items-center gap-2">
                <button onClick={handleRefreshStatus} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-hairline bg-white text-[11px] font-medium text-body hover:text-ink transition-colors">
                  <span className="material-symbols-outlined text-[15px]">bolt</span>{lang === 'zh' ? '强制重试' : 'Force retry'}
                </button>
                <button onClick={loadQuota} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-hairline bg-white text-[11px] font-medium text-body hover:text-ink transition-colors">
                  <span className="material-symbols-outlined text-[15px]">data_usage</span>{lang === 'zh' ? '刷新积分' : 'Refresh credits'}
                </button>
                <button onClick={doRefreshTokens} disabled={refreshingTokens} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-hairline bg-white text-[11px] font-medium text-body hover:text-ink transition-colors disabled:opacity-40">
                  <span className="material-symbols-outlined text-[15px]">autorenew</span>{refreshingTokens ? (lang === 'zh' ? '刷新中...' : 'Refreshing...') : (lang === 'zh' ? '一键刷新令牌' : 'Refresh tokens')}
                </button>
                <button onClick={handleClaimDaily} disabled={claiming || isClaimed} className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-hairline bg-white text-[11px] font-medium text-body hover:text-ink transition-colors disabled:opacity-40">
                  <span className="material-symbols-outlined text-[15px]">{isClaimed ? 'check_circle' : 'card_giftcard'}</span>{isClaimed ? (lang === 'zh' ? '今日已签' : 'Checked in') : (lang === 'zh' ? '今日签到' : 'Check in')}
                </button>
                <div className="ml-auto">
                  <button onClick={() => setShowAddAccount(true)} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-white text-[11px] font-medium hover:bg-primary transition-colors">
                    <span className="material-symbols-outlined text-[15px]">add</span>{t.accounts.importAccounts}
                  </button>
                </div>
              </section>

              {/* Filters */}
              <section className="flex flex-wrap items-center gap-2">
                <div className="flex bg-white border border-hairline rounded-full p-0.5">
                  {([
                    ['all', lang === 'zh' ? '全部' : 'All'],
                    ['active', lang === 'zh' ? '可用' : 'Active'],
                    ['error', lang === 'zh' ? '异常' : 'Error'],
                    ['disabled', lang === 'zh' ? '已停用' : 'Disabled'],
                  ] as const).map(([key, label]) => (
                    <button key={key} onClick={() => setAccountFilter(key)}
                      className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors ${accountFilter === key ? 'bg-ink text-white' : 'text-body hover:text-ink'}`}>
                      {label}
                      {key === 'all' && <span className="ml-1 opacity-60">{accounts.length}</span>}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-body text-[16px]">search</span>
                  <input value={searchAccounts} onChange={e => setSearchAccounts(e.target.value)} placeholder={t.accounts.search}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-hairline rounded-full text-[11px] text-ink outline-none focus:border-hairline-strong transition-colors placeholder:text-body/50" />
                </div>
                <div className="w-32">
                  <CustomSelect value={accountSort} onChange={(v) => setAccountSort(v as typeof accountSort)} options={[
                    { value: 'default', label: lang === 'zh' ? '默认顺序' : 'Default' },
                    { value: 'quota', label: lang === 'zh' ? '按积分' : 'By credits' },
                    { value: 'expiry', label: lang === 'zh' ? '按有效期' : 'By expiry' },
                  ]} />
                </div>
              </section>

              {/* Table */}
              <section className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft">
                        {[lang === 'zh' ? '账号' : 'Account', 'UID', lang === 'zh' ? '状态' : 'Status', lang === 'zh' ? '积分余额' : 'Credits', lang === 'zh' ? 'Token 有效期' : 'Token expiry', lang === 'zh' ? '操作' : 'Actions'].map((h, i) => (
                          <th key={i} className={`px-4 py-2.5 text-[9px] font-medium text-body uppercase tracking-wider ${i === 5 ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {filteredAccounts.length === 0 ? (
                        <tr><td colSpan={6} className="py-12 text-center text-xs text-body">{t.accounts.empty}</td></tr>
                      ) : filteredAccounts.map(acc => {
                        const isActive = accountsConfig.active_uid === acc.uid
                        const perAccount = quotaByUid.get(acc.uid)?.quota?.userQuota
                        const baseQ = perAccount && perAccount.total ? perAccount : (isActive ? planQuota : null)
                        const q = baseQ
                          ? (isActive && addOnQuota
                              ? {
                                  total: (baseQ.total || 0) + (addOnQuota.total || 0),
                                  used: (baseQ.used || 0) + (addOnQuota.used || 0),
                                  remaining: (baseQ.remaining || 0) + (addOnQuota.remaining || 0),
                                }
                              : baseQ)
                          : null
                        const hasQuotaDetail = Boolean(q && q.total)
                        const usedPct = hasQuotaDetail && q ? Math.min(100, Math.round((q.used / q.total) * 100)) : null
                        const expiresTs = acc.token_expires_at ? new Date(acc.token_expires_at).getTime() : 0
                        const daysLeft = expiresTs ? Math.max(0, (expiresTs - Date.now()) / 86400000) : null
                        const expiryPct = daysLeft !== null ? Math.min(100, Math.round((daysLeft / 7) * 100)) : 0
                        return (
                          <tr key={acc.uid} className={`hover:bg-canvas-soft transition-colors group ${isActive ? 'bg-mint-soft/40' : ''}`}>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${isActive ? 'bg-ink text-white' : 'bg-canvas-soft text-body border border-hairline'}`}>
                                  {acc.name?.slice(0, 1).toUpperCase() || 'Q'}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-ink truncate">{acc.name}</span>
                                    {isActive && <span className="text-[8px] bg-ink text-white px-1 py-0.5 rounded shrink-0">{lang === 'zh' ? '当前' : 'Active'}</span>}
                                  </div>
                                  <div className="text-[9px] text-body mt-0.5">{acc.user_tag || acc.plan || 'Trial'}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 font-mono text-[10px] text-body select-all max-w-[180px] truncate" title={acc.uid}>{acc.uid}</td>
                            <td className="px-4 py-3.5">
                              {!acc.enabled ? (
                                <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-hairline text-body">{lang === 'zh' ? '已停用' : 'Disabled'}</span>
                              ) : acc.is_quota_exceeded ? (
                                <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-peach text-peach-deep">{lang === 'zh' ? '超额' : 'Exceeded'}</span>
                              ) : acc.last_status === 'ok' ? (
                                <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-mint text-mint-deep flex items-center gap-1 w-fit">
                                  <span className="w-1 h-1 rounded-full bg-mint-deep"></span>{lang === 'zh' ? '正常' : 'OK'}
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-medium rounded-full bg-peach text-peach-deep" title={acc.last_error || ''}>{lang === 'zh' ? '异常' : 'Error'}</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              {hasQuotaDetail && q ? (
                                <>
                                  <div className="text-xs font-medium text-ink font-mono">{q.remaining}</div>
                                  <div className="w-24 mt-1.5">
                                    <ShareBar value={usedPct ?? 0} max={100} color={(usedPct ?? 0) > 85 ? 'bg-peach-deep' : 'bg-mint-deep'} />
                                  </div>
                                  <div className="text-[9px] text-body mt-1">
                                    {q.total} {lang === 'zh' ? '总额' : 'total'}
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className={`text-xs font-mono ${acc.quota ? 'text-ink' : 'text-body/40'}`}>{acc.quota || '—'}</div>
                                  <div className="text-[9px] text-body mt-1">{lang === 'zh' ? '记录值 · 刷新积分获取明细' : 'Recorded · refresh for detail'}</div>
                                </>
                              )}
                              <div className="text-[9px] text-body mt-1">
                                {acc.next_reset_at ? `${new Date(acc.next_reset_at).toLocaleDateString()} ${lang === 'zh' ? '重置' : 'reset'}` : ''}
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              {daysLeft === null ? (
                                <span className="text-[10px] text-body">—</span>
                              ) : (
                                <div>
                                  <div className={`text-[11px] font-medium ${daysLeft < 1 ? 'text-peach-deep' : 'text-ink'}`}>{daysLeft.toFixed(1)} {lang === 'zh' ? '天' : 'days'}</div>
                                  <div className="w-24 mt-1.5">
                                    <ShareBar value={expiryPct} max={100} color={daysLeft < 1 ? 'bg-peach-deep' : 'bg-mint-deep'} />
                                  </div>
                                  <div className="text-[9px] text-body mt-1">{acc.token_expires_at ? new Date(acc.token_expires_at).toLocaleDateString() : ''}</div>
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => handleSelectAccount(acc.uid)} disabled={isActive || !acc.enabled} title={lang === 'zh' ? '设为当前' : 'Set active'}
                                  className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded-md disabled:opacity-25 transition-colors">
                                  <span className="material-symbols-outlined text-[16px]">play_circle</span>
                                </button>
                                <button onClick={() => handleCopyKey(acc.uid)} title={lang === 'zh' ? '复制 UID' : 'Copy UID'}
                                  className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded-md transition-colors">
                                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                                </button>
                                <Toggle checked={acc.enabled} onChange={() => handleToggleAccount(acc.uid, !acc.enabled)} />
                                <button onClick={() => handleDeleteAccount(acc.uid)} title={t.common.delete}
                                  className="p-1.5 text-body hover:text-toast-error hover:bg-toast-error/10 rounded-md transition-colors">
                                  <span className="material-symbols-outlined text-[16px]">delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-hairline bg-canvas-soft flex items-center justify-between">
                  <p className="text-[10px] text-body">{t.accounts.showing.replace('{count}', String(filteredAccounts.length))}</p>
                  <p className="text-[10px] text-body/70">{lang === 'zh' ? '积分余额 = 主套餐 + 签到算力 · 有效期进度以 7 天为满格' : 'Credits = plan + add-on · expiry bar scaled to 7 days'}</p>
                </div>
              </section>
            </div>
          )}

          {/* ─── MODELS ─── */}
          {activeTab === 'models' && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '可用模型' : 'Models'}</div>
                  <div className="font-display-md text-ink leading-none">{models.length || '—'}</div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '来源 GET /v1/models' : 'From GET /v1/models'}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '支持推理' : 'Reasoning'}</div>
                  <div className="font-display-md text-ink leading-none">{models.length ? reasoningCount : '—'}</div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '可调 low → xhigh/max' : 'low → xhigh/max'}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '最大上下文' : 'Max context'}</div>
                  <div className="font-display-md text-ink leading-none">{maxContext ? (maxContext >= 1_000_000 ? '1M' : formatContext(maxContext)) : '—'}</div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '按模型声明的上限' : 'Declared per model'}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '免费模型' : 'Free models'}</div>
                  <div className="font-display-md text-mint-deep leading-none">{models.length ? freeCount : '—'}</div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '0 倍率不计费' : 'Zero-rate, no charge'}</div>
                </div>
              </section>

              <section className="card p-3 flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-body text-[16px]">search</span>
                  <input value={modelQuery} onChange={e => setModelQuery(e.target.value)} placeholder={lang === 'zh' ? '搜索模型名称 / ID / 供应商' : 'Search model / ID / vendor'}
                    className="w-full pl-9 pr-3 py-2 bg-canvas-soft border border-hairline rounded-full text-[11px] text-ink outline-none focus:border-hairline-strong transition-colors placeholder:text-body/50" />
                </div>
                <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar">
                  {modelSeriesOptions.map(s => (
                    <button key={s} onClick={() => setModelSeries(s)}
                      className={`px-2.5 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${modelSeries === s ? 'bg-ink text-white' : 'bg-canvas-soft text-body hover:text-ink border border-hairline'}`}>
                      {s === '全部' && lang === 'zh' ? '全部' : s === '全部' ? 'All' : s}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {['支持推理', '1M 上下文', '免费'].map(cap => {
                    const on = modelCaps.includes(cap)
                    return (
                      <button key={cap} onClick={() => setModelCaps(prev => on ? prev.filter(c => c !== cap) : [...prev, cap])}
                        className={`px-2.5 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap border transition-colors ${on ? 'bg-peach text-peach-deep border-peach' : 'bg-white text-body border-hairline hover:text-ink'}`}>
                        {lang === 'zh' ? cap : cap === '支持推理' ? 'Reasoning' : cap === '1M 上下文' ? '1M context' : 'Free'}
                      </button>
                    )
                  })}
                </div>
              </section>

              <section className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft">
                        {[lang === 'zh' ? '模型' : 'Model', lang === 'zh' ? '上下文' : 'Context', lang === 'zh' ? '推理档位' : 'Reasoning', lang === 'zh' ? '系列' : 'Series', lang === 'zh' ? '能力' : 'Capabilities', lang === 'zh' ? '倍率' : 'Rate'].map((h, i) => (
                          <th key={i} className={`px-4 py-2.5 text-[9px] font-medium text-body uppercase tracking-wider ${i >= 5 ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {filteredModels.length === 0 ? (
                        <tr><td colSpan={6} className="py-12 text-center text-xs text-body">{modelsError ? (lang === 'zh' ? '模型列表加载失败' : 'Failed to load models') : (lang === 'zh' ? '没有匹配的模型' : 'No matching models')}</td></tr>
                      ) : filteredModels.map(m => (
                        <tr key={m.id} className="hover:bg-canvas-soft transition-colors group cursor-pointer" onClick={() => { navigator.clipboard.writeText(m.id); pushToast('SUCCESS', lang === 'zh' ? '已复制模型 ID' : 'Model ID copied', m.id) }}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-medium text-ink">{m.name}</span>
                              {m.free && <span className="px-1.5 py-0.5 bg-mint text-ink text-[8px] font-medium rounded-full">FREE</span>}
                            </div>
                            <div className="font-mono text-[9px] text-body mt-0.5">{m.id}</div>
                          </td>
                          <td className="px-4 py-3 font-mono text-[10px] text-body whitespace-nowrap">{formatContext(m.contextLength)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              {m.efforts.length === 0 ? <span className="text-[10px] text-body">—</span> : m.efforts.map(e => (
                                <span key={e} className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono ${e === m.defaultEffort ? 'bg-ink text-white' : 'bg-canvas-soft text-body border border-hairline'}`}>{e}</span>
                              ))}
                              {m.efforts.length > 1 && <span className="text-[8px] text-body/60 ml-0.5">{lang === 'zh' ? '默认' : 'default'}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-medium bg-lavender-soft text-ink">{m.series || '—'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {m.capabilities.length === 0 ? <span className="text-[10px] text-body">—</span> : m.capabilities.map(c => (
                                <span key={c} className={`px-1.5 py-0.5 rounded-full text-[9px] ${c === '仅推理' ? 'bg-sky-soft text-sky-deep' : c === '智能路由' ? 'bg-peach-soft text-peach-deep' : 'bg-canvas-soft text-body border border-hairline'}`}>{c}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-[10px] text-ink">{m.rate || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2.5 border-t border-hairline bg-canvas-soft">
                  <p className="text-[10px] text-body">{lang === 'zh' ? '点击任意行复制模型 ID · 倍率为相对扣费系数' : 'Click a row to copy model ID · rate is relative credit multiplier'}</p>
                </div>
              </section>
            </div>
          )}

          {/* ─── USAGE ─── */}
          {activeTab === 'usage' && (
            <div className="space-y-4">
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '今日请求' : 'Requests today'}</div>
                  <div className="font-display-md text-ink leading-none">{usageStats?.today.requests ?? 0}</div>
                  <div className="text-[10px] text-body mt-1.5">{fmt(usageStats?.today.tokens ?? 0)} Tokens（{lang === 'zh' ? '估算' : 'est.'}）</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '本周请求' : 'Requests this week'}</div>
                  <div className="font-display-md text-ink leading-none">{usageStats?.week.requests ?? 0}</div>
                  <div className="text-[10px] text-body mt-1.5">{fmt(usageStats?.week.tokens ?? 0)} Tokens（{lang === 'zh' ? '估算' : 'est.'}）</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '累计请求' : 'Total requests'}</div>
                  <div className="font-display-md text-peach-deep leading-none">{usageStats?.total.requests ?? 0}</div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '自统计启用以来' : 'Since tracking started'}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '活跃密钥' : 'Active keys'}</div>
                  <div className="font-display-md text-ink leading-none">{usageStats?.keys.used ?? 0}<span className="text-xs text-body font-sans">/{usageStats?.keys.configured ?? 0}</span></div>
                  <div className="text-[10px] text-body mt-1.5">{lang === 'zh' ? '本周有调用的 / 已配置' : 'Used this week / configured'}</div>
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium text-ink">{lang === 'zh' ? 'Token 消费趋势' : 'Token consumption'}</div>
                      <div className="text-[10px] text-body mt-0.5">{lang === 'zh' ? '近 14 天 · 按日聚合 · 估算值' : 'Last 14 days · daily · estimated'}</div>
                    </div>
                    <button onClick={fetchUsageStats} className="text-[10px] text-body hover:text-ink flex items-center gap-0.5 transition-colors">
                      <span className="material-symbols-outlined text-[13px]">refresh</span>{t.common.refresh}
                    </button>
                  </div>
                  <AreaChart data={usageStats?.daily || []} valueKey="tokens" height={200} />
                </div>
                <div className="card p-5">
                  <div className="text-sm font-medium text-ink mb-3">{lang === 'zh' ? '24 小时请求' : 'Requests · 24h'}</div>
                  <AreaChart data={usageStats?.hourly || []} valueKey="requests" height={200} stroke="#0f766e" fillTop="rgba(167,229,211,0.55)" fillBottom="rgba(167,229,211,0.04)" labelEvery={4} />
                </div>
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">{lang === 'zh' ? '按模型' : 'By model'}</span>
                    <span className="text-[10px] text-body">{lang === 'zh' ? '本周' : 'This week'}</span>
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline">
                        {[lang === 'zh' ? '模型' : 'Model', lang === 'zh' ? '请求' : 'Requests', 'Tokens'].map(h => (
                          <th key={h} className="px-4 py-2 text-[9px] font-medium text-body uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {(usageStats?.by_model || []).length === 0 ? (
                        <tr><td colSpan={3} className="py-10 text-center text-xs text-body">{lang === 'zh' ? '暂无调用数据' : 'No usage yet'}</td></tr>
                      ) : (usageStats?.by_model || []).map(row => {
                        const maxReq = Math.max(1, ...(usageStats?.by_model || []).map(r => r.requests))
                        return (
                          <tr key={row.model} className="hover:bg-canvas-soft transition-colors">
                            <td className="px-4 py-3 min-w-[140px]">
                              <div className="text-[11px] font-mono text-ink">{row.model}</div>
                              <div className="mt-1.5"><ShareBar value={row.requests} max={maxReq} color="bg-peach-deep" /></div>
                            </td>
                            <td className="px-4 py-3 text-[11px] font-mono text-body">{row.requests}</td>
                            <td className="px-4 py-3 text-[11px] font-mono text-body">{fmt(row.tokens)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-hairline flex items-center justify-between">
                    <span className="text-xs font-medium text-ink">{lang === 'zh' ? '按密钥 / 账号' : 'By key / account'}</span>
                    <span className="text-[10px] text-body">{lang === 'zh' ? '本周' : 'This week'}</span>
                  </div>
                  <div className="divide-y divide-hairline">
                    {(usageStats?.by_key || []).map(row => (
                      <div key={row.key} className="px-4 py-3 flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] text-ink truncate">{row.key}</span>
                        <span className="text-[10px] text-body shrink-0">{row.requests} {lang === 'zh' ? '次' : 'req'} · {fmt(row.tokens)}</span>
                      </div>
                    ))}
                    {(usageStats?.by_account || []).map(row => (
                      <div key={row.uid} className="px-4 py-3 flex items-center justify-between gap-3">
                        <span className="text-[11px] text-ink truncate">{row.name || row.uid.slice(0, 10)}</span>
                        <span className="text-[10px] text-body shrink-0">{row.requests} {lang === 'zh' ? '次' : 'req'} · {fmt(row.tokens)}</span>
                      </div>
                    ))}
                    {(usageStats?.by_key || []).length === 0 && (usageStats?.by_account || []).length === 0 && (
                      <div className="py-10 text-center text-xs text-body">{lang === 'zh' ? '暂无调用数据' : 'No usage yet'}</div>
                    )}
                  </div>
                </div>
              </section>

              <p className="text-[10px] text-body/70 px-1">
                {lang === 'zh'
                  ? '说明：请求数为网关实际记录；Token 数由请求与响应文本长度估算（CJK 按 1 字 ≈ 1 token，其余按 4 字符 ≈ 1 token），仅用于趋势参考。'
                  : 'Note: request counts are exact; tokens are estimated from payload length (CJK ≈ 1 token/char, others ≈ 4 chars/token) for trend reference only.'}
              </p>
            </div>
          )}

          {/* ─── PLAYGROUND ─── */}
          {activeTab === 'playground' && (
            <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-13rem)]">
              <aside className="w-full lg:w-[260px] flex flex-col gap-3 shrink-0">
                <div className="card p-4">
                  <label className="text-[10px] font-medium text-body uppercase tracking-wide block mb-2">{t.playground.modelConfig}</label>
                  <select value={model} onChange={e => setModel(e.target.value)} disabled={models.length === 0}
                    className="w-full px-3 py-2 bg-canvas-soft border border-hairline rounded-lg text-xs text-ink outline-none focus:border-hairline-strong transition-colors cursor-pointer disabled:opacity-50">
                    {models.length === 0 && <option value="">{modelsError ? (lang === 'zh' ? '模型加载失败' : 'Failed to load') : (lang === 'zh' ? '加载中...' : 'Loading...')}</option>}
                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div className="text-[10px] text-body mt-1.5 font-mono truncate">{model}</div>
                </div>
                <div className="card p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-[10px] font-medium text-body uppercase tracking-wide">{t.playground.streamResponse}</span>
                    <Toggle checked={stream} onChange={() => setStream(!stream)} />
                  </label>
                </div>
                <div className="card p-4 flex-1 flex flex-col min-h-0">
                  <label className="text-[10px] font-medium text-body uppercase tracking-wide mb-2">{t.playground.systemPrompt}</label>
                  <textarea placeholder={t.playground.systemPromptPlaceholder}
                    className="custom-textarea flex-1 w-full p-3 bg-canvas-soft border border-hairline rounded-lg text-xs text-ink outline-none focus:border-hairline-strong transition-colors resize-none placeholder:text-body/50" />
                </div>
              </aside>

              <section className="flex-1 flex flex-col card overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {chatMessages.map((m, idx) => (
                    <div key={idx} className={`flex gap-3 ${m.role === 'user' ? 'max-w-[80%] ml-auto flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-medium ${m.role === 'user' ? 'bg-ink text-white' : 'bg-mint text-ink'}`}>
                        {m.role === 'user' ? 'U' : <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>}
                      </div>
                      <div className={`flex-1 min-w-0 ${m.role === 'user' ? '' : 'space-y-3'}`}>
                        {m.role === 'user' ? (
                          <div className="bg-ink text-white p-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
                        ) : m.content === '' ? (
                          <div className="flex items-center gap-2 text-body py-1 text-xs animate-pulse">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            {t.playground.waiting}
                          </div>
                        ) : renderMessageContent(m.content)}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendChat} className="p-4 border-t border-hairline bg-canvas-soft">
                  <div className="flex items-end gap-2">
                    <textarea value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder={t.playground.ask} rows={1}
                      className="custom-textarea flex-1 px-3.5 py-2.5 bg-white border border-hairline rounded-xl text-sm text-ink outline-none focus:border-hairline-strong transition-colors resize-none placeholder:text-body/50" />
                    <button type="submit" disabled={generating || !chatInput.trim()}
                      className="px-4 py-2.5 bg-ink text-white rounded-full flex items-center gap-1.5 hover:bg-primary transition-colors active:scale-95 disabled:opacity-40 shrink-0 text-sm font-medium">
                      <span className="material-symbols-outlined text-[16px]">send</span>
                      <span className="hidden sm:inline">{t.playground.send}</span>
                    </button>
                  </div>
                </form>
              </section>
            </div>
          )}

          {/* ─── API KEYS ─── */}
          {activeTab === 'api-keys' && (
            <div className="space-y-4">
              <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-body">{t.api.desc}</p>
                <button onClick={handleGenerateKey} className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-full hover:bg-primary transition-colors text-[11px] font-medium">
                  <span className="material-symbols-outlined text-[15px]">add</span>{t.api.generate}
                </button>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="card p-5 flex flex-col justify-between min-h-[150px]">
                  <div>
                    <div className="text-xs font-medium text-ink mb-1.5">{t.api.gatewayAuth}</div>
                    <p className="text-[11px] text-body leading-relaxed">{t.api.gatewayAuthDesc}</p>
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-hairline">
                    <span className="text-[9px] font-medium text-body uppercase tracking-wide">{t.api.systemStatus}</span>
                    <Toggle checked={apiConfig.auth_required} onChange={handleToggleAuth} />
                  </div>
                </div>
                <div className="card p-5 flex flex-col justify-between min-h-[150px]">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide">{t.api.activeKeys}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display-md text-ink leading-none">{apiConfig.allowed_keys.length}</span>
                    <span className="text-[11px] text-body">{t.api.configured}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-mint-deep">
                    <span className="w-1.5 h-1.5 rounded-full bg-mint-deep"></span>
                    {apiConfig.auth_required ? (lang === 'zh' ? '鉴权已启用' : 'Auth enabled') : (lang === 'zh' ? '开放访问模式' : 'Open access')}
                  </div>
                </div>
                <div className="card p-5 flex flex-col justify-between min-h-[150px]">
                  <div className="text-xs font-medium text-ink mb-1">{t.api.bestPractices}</div>
                  <p className="text-[11px] text-body leading-relaxed flex-1">{t.api.bestPracticesDesc}</p>
                  <div className="flex items-center gap-1.5 text-mint-deep bg-mint text-[10px] font-medium px-2 py-1 rounded-full self-start">
                    <span className="material-symbols-outlined text-[12px]">shield</span>{t.api.securityPolicy}
                  </div>
                </div>
              </div>

              <section className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <span className="text-xs font-medium text-ink">{t.api.activeAccessKeys}</span>
                  <div className="flex gap-2">
                    <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder={t.api.keyPlaceholder}
                      className="w-56 px-3 py-1.5 bg-canvas-soft border border-hairline rounded-lg text-[11px] font-mono text-ink outline-none focus:border-hairline-strong transition-colors" />
                    <button onClick={handleAddKey} disabled={!newKey.trim()} className="px-3.5 py-1.5 bg-ink text-white rounded-lg text-[11px] font-medium hover:bg-primary transition-colors disabled:opacity-40">{t.common.add}</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft">
                        <th className="px-4 py-2.5 text-[9px] font-medium text-body uppercase tracking-wider">Key</th>
                        <th className="px-4 py-2.5 text-[9px] font-medium text-body uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {apiConfig.allowed_keys.length === 0 ? (
                        <tr><td colSpan={2} className="py-12 text-center text-xs text-body">{t.api.noKeys}</td></tr>
                      ) : apiConfig.allowed_keys.map(key => (
                        <tr key={key} className="hover:bg-canvas-soft transition-colors group">
                          <td className="px-4 py-3 font-mono text-[11px] text-ink select-all break-all">{key}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleCopyKey(key)} className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded-md transition-colors" title="Copy">
                                <span className="material-symbols-outlined text-[16px]">{copiedKey === key ? 'check_circle' : 'content_copy'}</span>
                              </button>
                              <button onClick={() => handleDeleteKey(key)} className="p-1.5 text-body hover:text-toast-error hover:bg-toast-error/10 rounded-md transition-colors" title="Delete">
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}

          {/* ─── LOGS ─── */}
          {activeTab === 'logs' && (
            <div className="space-y-3">
              <section className="relative z-40 card p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[9px] font-medium text-body uppercase tracking-wide block mb-1">{t.logs.account}</label>
                  <CustomSelect value={logFilterAccount} onChange={setLogFilterAccount} options={accountLogOptions} placeholder={t.logs.allAccounts} />
                </div>
                <div>
                  <label className="text-[9px] font-medium text-body uppercase tracking-wide block mb-1">{t.logs.status}</label>
                  <CustomSelect value={logFilterStatus} onChange={setLogFilterStatus} options={[{ value: 'all', label: t.logs.allStatuses }, { value: 'info', label: 'Info' }, { value: 'error', label: 'Error' }, { value: 'warning', label: 'Warning' }]} placeholder={t.logs.allStatuses} />
                </div>
                <div>
                  <label className="text-[9px] font-medium text-body uppercase tracking-wide block mb-1">{t.logs.range}</label>
                  <CustomSelect value={logFilterRange} onChange={setLogFilterRange} options={[{ value: '24h', label: t.logs.last24h }, { value: '1h', label: t.logs.lastHour }, { value: '7d', label: t.logs.last7d }]} placeholder={t.logs.last24h} />
                </div>
                <div className="flex items-end">
                  <button onClick={fetchLogs} className="w-full h-10 bg-ink text-white rounded-full flex items-center justify-center gap-1.5 hover:bg-primary transition-colors text-[11px] font-medium">
                    <span className="material-symbols-outlined text-[15px]">refresh</span>{t.common.refresh}
                  </button>
                </div>
              </section>

              <section className="card overflow-hidden">
                <div className="max-h-[calc(100vh-19rem)] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-canvas-soft border-b border-hairline">
                        {[t.logs.timestamp, t.logs.level, t.logs.message].map(h => (
                          <th key={h} className="px-4 py-2.5 text-[9px] font-medium text-body uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {logs.length === 0 ? (
                        <tr><td colSpan={3} className="py-12 text-center text-xs text-body">{t.logs.noLogs}</td></tr>
                      ) : filteredLogs.length === 0 ? (
                        <tr><td colSpan={3} className="py-12 text-center text-xs text-body">{t.logs.noMatch}</td></tr>
                      ) : filteredLogs.map((log, i) => {
                        const level = log.match(/\[(INFO|ERROR|WARNING)\]/)?.[1] || 'INFO'
                        const isError = level === 'ERROR'
                        const isWarn = level === 'WARNING'
                        return (
                          <tr key={i} className={`hover:bg-canvas-soft transition-colors ${isError ? 'bg-toast-error/5' : isWarn ? 'bg-peach-soft/60' : ''}`}>
                            <td className="px-4 py-2 font-mono text-[10px] text-body whitespace-nowrap">{log.substring(0, 10)}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-medium ${isError ? 'bg-toast-error/10 text-toast-error' : isWarn ? 'bg-peach text-peach-deep' : 'bg-mint text-mint-deep'}`}>{level}</span>
                            </td>
                            <td className="px-4 py-2 font-mono text-[10px] text-ink break-all">{log.replace(/^\[[\d:]+\]\s*\[\w+\]\s*/, '')}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  <div ref={logEndRef} />
                </div>
              </section>
            </div>
          )}

          {/* ─── REGISTRAR ─── */}
          {activeTab === 'register' && (
            <div className="space-y-4">
              {/* Explanation */}
              <section className="card p-5 bg-gradient-to-br from-white to-peach-soft/50">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-peach flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px] text-peach-deep">help</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink mb-1">{lang === 'zh' ? '自动注册机是做什么的？' : 'What does the registrar do?'}</div>
                    <p className="text-[11px] text-body leading-relaxed">
                      {lang === 'zh'
                        ? '它会启动隐藏的浏览器，自动走完 Qoder 的邮箱注册流程：填写邮箱 → 等待邮箱验证码 → 通过人机验证滑块 → 拉取 Device Token → 自动写入账号池。你只需要在弹出的置顶窗口里完成滑块验证。'
                        : 'It drives hidden browsers through Qoder email sign-up: fill email → wait for the email code → solve the slider → pull the device token → save into the account pool. You only need to solve the slider in the topmost window.'}
                    </p>
                    <p className="text-[11px] text-peach-deep mt-1.5">
                      {lang === 'zh'
                        ? '前置条件：需要在项目根目录 .env 中配置 YYDS_API_KEY（邮箱验证码服务，AC- 开头）并重启服务，否则任务会以「YYDS_API_KEY 未配置」失败。'
                        : 'Requirement: set YYDS_API_KEY (email code service, starts with AC-) in .env and restart; otherwise tasks fail with “YYDS_API_KEY not configured”.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-body leading-relaxed">{t.register.desc}</p>
                  <p className="text-[10px] text-body/80 mt-1">{t.register.staggerHint}</p>
                </div>
                <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                  <span className="text-[11px] font-medium text-body">{t.register.countLabel}</span>
                  <div className="flex bg-canvas-soft rounded-full p-0.5 gap-0.5">
                    {[1, 2, 3, 4].map(n => (
                      <button key={n} onClick={() => setRegCount(n)} disabled={regStatus?.running}
                        className={`w-8 h-8 rounded-full text-[11px] font-medium transition-colors ${regCount === n ? 'bg-ink text-white' : 'text-body hover:bg-hairline'}`}>{n}</button>
                    ))}
                  </div>
                  {regStatus?.running ? (
                    <button onClick={stopRegister} disabled={regStopping || regStatus?.stop_requested}
                      className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[11px] font-medium transition-colors ${regStopping || regStatus?.stop_requested ? 'bg-hairline text-body cursor-not-allowed' : 'bg-toast-error text-white hover:bg-toast-error/90'}`}>
                      <span className="material-symbols-outlined text-[15px]">stop_circle</span>
                      <span>{regStopping || regStatus?.stop_requested ? t.register.stopping : t.register.stop}</span>
                    </button>
                  ) : (
                    <button onClick={startRegister} disabled={regStarting}
                      className={`h-9 px-4 rounded-full flex items-center gap-1.5 text-[11px] font-medium transition-colors ${regStarting ? 'bg-hairline text-body cursor-not-allowed' : 'bg-ink text-white hover:bg-primary'}`}>
                      <span className="material-symbols-outlined text-[15px]">person_add</span>
                      <span>{regStarting ? t.register.starting : t.register.start}</span>
                    </button>
                  )}
                </div>
              </section>

              {regStatus?.verification && regStatus?.running && (
                <div className="p-3.5 bg-peach-soft border border-peach rounded-xl text-[11px] text-peach-deep flex items-center gap-2">
                  <span className="material-symbols-outlined text-[17px] animate-pulse">touch_app</span>
                  <span>{t.register.verifyHint}（{t.register.task} {regStatus.verification}）</span>
                </div>
              )}

              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="card p-4">
                  <div className="text-[9px] font-medium text-body uppercase tracking-wide mb-1">{t.register.statsLabel}</div>
                  <div className="font-display-md text-ink leading-none">{regStatus?.stats?.total ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[9px] font-medium text-mint-deep uppercase tracking-wide mb-1">{t.register.success}</div>
                  <div className="font-display-md text-mint-deep leading-none">{regStatus?.stats?.success ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[9px] font-medium text-toast-error uppercase tracking-wide mb-1">{t.register.failed}</div>
                  <div className="font-display-md text-toast-error leading-none">{regStatus?.stats?.failed ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[9px] font-medium text-body uppercase tracking-wide mb-1">{lang === 'zh' ? '启动时间' : 'Started at'}</div>
                  <div className="text-sm font-mono text-ink mt-1.5">{regStatus?.started_at ? new Date(regStatus.started_at * 1000).toLocaleTimeString() : '—'}</div>
                </div>
              </section>

              {(() => {
                const allTasks = { ...(regStatus?.active || {}), ...(regStatus?.recent || {}) }
                const entries = Object.entries(allTasks)
                if (entries.length === 0) {
                  return <div className="card p-10 text-center text-xs text-body">{t.register.noResult}</div>
                }
                return (
                  <div className="space-y-3">
                    {entries.map(([tid, task]) => {
                      const stageText = (t.register.stage as Record<string, string>)[task.stage] || task.stage
                      const isVerify = regStatus?.verification === tid
                      const isActive = !!regStatus?.active?.[tid]
                      return (
                        <div key={tid} className={`card overflow-hidden ${isVerify ? 'ring-2 ring-peach' : ''}`}>
                          <div className="px-4 py-2.5 border-b border-hairline flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-medium text-ink">{t.register.task} {tid}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${task.stage === 'success' ? 'bg-mint text-mint-deep' : task.stage === 'failed' ? 'bg-toast-error/10 text-toast-error' : task.stage === 'waiting_slider' ? 'bg-peach text-peach-deep' : 'bg-canvas-soft text-body border border-hairline'}`}>{stageText}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] text-body font-mono">
                              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isActive ? (task.stage === 'success' ? 'bg-mint-deep' : task.stage === 'failed' ? 'bg-toast-error' : 'bg-peach-deep animate-pulse') : 'bg-hairline-strong'}`} />
                              <span>{task.started_at ? new Date(task.started_at * 1000).toLocaleTimeString() : ''}</span>
                            </div>
                          </div>
                          <div className="px-4 py-2.5 h-28 overflow-y-auto font-mono text-[10px] leading-relaxed text-body space-y-0.5 bg-canvas-soft">
                            {task.logs.slice().reverse().map((line, i) => (
                              <div key={i} className={`break-all ${/FAILED|ERROR/i.test(line) ? 'text-toast-error' : ''}`}>{line}</div>
                            ))}
                          </div>
                          {task.result && (
                            <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs border-t border-hairline">
                              {[
                                { label: lang === 'zh' ? '邮箱' : 'Email', value: task.result.email },
                                { label: lang === 'zh' ? '密码' : 'Password', value: task.result.password },
                                { label: lang === 'zh' ? '姓名' : 'Name', value: task.result.name },
                                { label: 'Token', value: task.result.device.token },
                                { label: 'Refresh', value: task.result.device.refresh_token },
                                { label: 'UID', value: task.result.device.user_id },
                              ].map((f, i) => (
                                <div key={i} className="min-w-0">
                                  <div className="text-[9px] font-medium text-body uppercase tracking-wide">{f.label}</div>
                                  <div className="mt-0.5 font-mono text-[10px] text-ink break-all truncate">{f.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {task.error && <div className="px-4 py-2.5 text-[11px] text-toast-error border-t border-hairline">{task.error}</div>}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      </main>

      {/* Bottom Dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 px-2 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-0.5 sm:gap-1 px-2 py-1.5 glass-card border border-hairline rounded-2xl shadow-lg max-w-full overflow-x-auto hide-scrollbar">
          {NAV_ITEMS.map(item => {
            const isActive = activeTab === item.id
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id)} title={navLabels[item.id]}
                className={`relative flex flex-col items-center justify-center w-12 sm:w-14 h-11 shrink-0 rounded-xl transition-all ${isActive ? 'bg-ink text-white' : 'text-body hover:bg-canvas-soft hover:text-ink'}`}>
                <span className="material-symbols-outlined text-[19px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : '' }}>{item.icon}</span>
                <span className="text-[9px] font-medium mt-0.5">{navShort[item.id]}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Add account modal */}
      {showAddAccount && (
        <Modal title={t.accounts.importAccounts} subtitle={lang === 'zh' ? '手机号 / 账号密码登录，或导入现有凭据' : 'Sign in with phone, or import existing credentials'} onClose={closeAddAccount}>
          <div className="space-y-3">
            {/* Qoder sign-in (device flow) */}
            <div className="p-4 rounded-xl border border-hairline">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-mint flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-mint-deep">login</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-ink">{lang === 'zh' ? '通过 Qoder 登录页添加' : 'Sign in on Qoder'}</div>
                  <div className="text-[10px] text-body mt-0.5">
                    {lang === 'zh' ? '手机号验证码 / 账号密码登录，授权后自动写入账号池' : 'Phone + SMS code or password; auto-saved after approval'}
                  </div>
                </div>
              </div>

              {deviceStatus === 'idle' && (
                <button onClick={startDeviceLogin} className="mt-3 w-full py-2.5 bg-ink text-white rounded-full text-[11px] font-medium hover:bg-primary transition-colors flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">open_in_new</span>
                  {lang === 'zh' ? '打开 Qoder 登录页' : 'Open Qoder sign-in'}
                </button>
              )}

              {deviceStatus === 'pending' && deviceFlow && (
                <div className="mt-3 rounded-lg bg-canvas-soft p-3">
                  <div className="flex items-center gap-2 text-[11px] text-ink">
                    <svg className="animate-spin h-3.5 w-3.5 text-body" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{lang === 'zh' ? '等待你在浏览器完成登录…' : 'Waiting for browser sign-in…'}</span>
                    <span className="ml-auto font-mono text-[10px] text-body">{deviceRemaining}s</span>
                  </div>
                  <p className="text-[10px] text-body mt-1.5">
                    {lang === 'zh' ? '如未自动打开新窗口，请点击下方链接。登录并同意授权后，此窗口会自动完成。' : 'If no tab opened, use the link below. It completes automatically after approval.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={deviceFlow.auth_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-white border border-hairline rounded-full text-[10px] font-medium text-ink hover:bg-canvas-soft transition-colors flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      {lang === 'zh' ? '重新打开登录页' : 'Reopen sign-in'}
                    </a>
                    <button onClick={() => { navigator.clipboard.writeText(deviceFlow.auth_url); pushToast('INFO', lang === 'zh' ? '已复制链接' : 'Link copied', '') }} className="px-3 py-1.5 bg-white border border-hairline rounded-full text-[10px] font-medium text-body hover:text-ink transition-colors flex items-center gap-1">
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                      {lang === 'zh' ? '复制链接' : 'Copy link'}
                    </button>
                    <button onClick={startDeviceLogin} className="px-3 py-1.5 text-[10px] font-medium text-body hover:text-ink transition-colors">
                      {lang === 'zh' ? '重新开始' : 'Restart'}
                    </button>
                  </div>
                </div>
              )}

              {deviceStatus === 'success' && (
                <div className="mt-3 p-2.5 rounded-lg bg-mint-soft text-[11px] text-mint-deep flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  {lang === 'zh' ? '登录成功，账号已写入账号池' : 'Signed in and saved'}
                </div>
              )}

              {(deviceStatus === 'error' || deviceStatus === 'expired') && (
                <div className="mt-3 p-2.5 rounded-lg bg-toast-error/10 text-[11px] text-toast-error">
                  {deviceError || (lang === 'zh' ? '登录失败' : 'Sign-in failed')}
                  <button onClick={startDeviceLogin} className="ml-2 underline font-medium">{lang === 'zh' ? '重试' : 'Retry'}</button>
                </div>
              )}
            </div>

            {/* Local import (desktop only) */}
            <button onClick={handleImportAuth} className="w-full text-left p-4 rounded-xl border border-hairline hover:border-hairline-strong hover:bg-canvas-soft transition-colors">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-canvas-soft border border-hairline flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-body">download_for_offline</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink">{lang === 'zh' ? '导入本机 Qoder 登录（仅电脑端）' : 'Import local Qoder session (desktop)'}</div>
                  <div className="text-[10px] text-body mt-0.5">
                    {lang === 'zh' ? '仅当运行网关的电脑已登录 Qoder 客户端时可用' : 'Only works when the gateway host has a signed-in Qoder client'}
                  </div>
                </div>
                <span className="material-symbols-outlined text-body ml-auto text-[18px]">arrow_forward</span>
              </div>
            </button>

            <div className="p-4 rounded-xl border border-hairline">
              <button onClick={() => setShowBatchImport(v => !v)} className="w-full flex items-center gap-2.5 text-left">
                <div className="w-9 h-9 rounded-lg bg-sky flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px] text-sky-deep">file_upload</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-ink">{lang === 'zh' ? '从注册机批量导入 JSON' : 'Batch import from registrar JSON'}</div>
                  <div className="text-[10px] text-body mt-0.5">{lang === 'zh' ? '粘贴 accounts.json，自动解析并写入账号池' : 'Paste accounts.json to import multiple accounts'}</div>
                </div>
                <span className={`material-symbols-outlined text-body ml-auto text-[18px] transition-transform ${showBatchImport ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
              {showBatchImport && (
                <div className="mt-3">
                  <textarea value={batchJson} onChange={e => setBatchJson(e.target.value)} rows={7}
                    placeholder='[{ "user_id": "019f...", "name": "...", "email": "...", "token": "dt-...", "refresh_token": "drt-...", "expires_at": "..." }]'
                    className="w-full p-3 rounded-lg border border-hairline bg-canvas-soft font-mono text-[11px] text-ink outline-none focus:border-hairline-strong focus:bg-white transition-colors" />
                  <div className="mt-2 flex gap-2">
                    <button onClick={doBatchImport} className="px-4 py-2 bg-ink text-white rounded-full text-[11px] font-medium hover:bg-primary transition-colors">{lang === 'zh' ? '导入' : 'Import'}</button>
                    <button onClick={() => { setBatchJson(''); setShowBatchImport(false) }} className="px-4 py-2 text-body border border-hairline rounded-full text-[11px] font-medium hover:text-ink transition-colors">{t.common.cancel}</button>
                  </div>
                </div>
              )}
            </div>

            <p className="text-[10px] text-body/70 leading-relaxed px-1">
              {lang === 'zh'
                ? '说明：账号凭据仅保存在本机 SQLite（~/.qoder/qoder2api.db），不会上传到任何第三方。'
                : 'Credentials are stored only in local SQLite (~/.qoder/qoder2api.db) and never uploaded.'}
            </p>
          </div>
        </Modal>
      )}

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  )
}
