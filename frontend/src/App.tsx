
const AVAILABLE_MODELS = [
  { id: 'auto', name: 'Auto', provider: 'Qoder', desc: '平台智能动态路由 (自适应最适底座)', context: '200K', price: '0.5x', tag: '智能路由', effort: '自适应', free: false },
  { id: 'qwen3.8-max', name: 'Qwen3.8-Max', provider: '阿里通义', desc: '通义顶配旗舰思考大模型 (强逻辑/代码)', context: '1000K (1M)', price: '0.5x', tag: '通义旗舰', effort: 'xhigh', free: false },
  { id: 'qwen3.8-flash', name: 'Qwen3.8-Flash', provider: '阿里通义', desc: '极速思考模型·高频日常调用推荐', context: '1000K (1M)', price: '0.0x', tag: '免费高频', effort: 'xhigh', free: true },
  { id: 'qwen3.7-plus', name: 'Qwen3.7-Plus', provider: '阿里通义', desc: '全功能通用超低倍率模型', context: '1000K (1M)', price: '0.1x', tag: '超低消耗', effort: '可开/关', free: false },
  { id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro', provider: 'DeepSeek', desc: '深度求索极致推理大模型 (复杂算法与数学)', context: '1000K (1M)', price: '0.5x', tag: '深度推理', effort: 'max', free: false },
  { id: 'deepseek-flash', name: 'DeepSeek-Flash', provider: 'DeepSeek', desc: '深度求索极速·不限额度免费调用', context: '1000K (1M)', price: '0.0x', tag: '免费极速', effort: 'max', free: true },
  { id: 'glm-5.3', name: 'GLM-5.3', provider: '智谱 AI', desc: '智谱AI新一代推理旗舰 (中文深度对齐)', context: '1000K (1M)', price: '0.8x', tag: '智谱旗舰', effort: 'max', free: false },
  { id: 'glm-5.3-flash', name: 'GLM-5.3-Flash', provider: '智谱 AI', desc: '原生百万长文本分析专家 (文档/长代码)', context: '1000K (1M)', price: '0.1x', tag: '1M长文本', effort: 'max', free: false },
  { id: 'kimi-k3', name: 'Kimi-K3', provider: '月之暗面', desc: '月之暗面长程旗舰推理 (长程推演与学术)', context: '1000K (1M)', price: '1.4x', tag: '长程推演', effort: 'max', free: false },
  { id: 'kimi-k2.8', name: 'Kimi-K2.8-Preview', provider: '月之暗面', desc: '代码架构与工程推演专家', context: '1000K (1M)', price: '0.8x', tag: '代码专家', effort: 'max', free: false },
  { id: 'minimax-m3.1-flash', name: 'MiniMax-M3.1-Flash', provider: 'MiniMax', desc: '超低延迟极速文本与对话', context: '200K', price: '0.1x', tag: '极速文本', effort: '纯文本', free: false },
]

import React, { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { gsap } from 'gsap'

// ─── Types ───

interface Account {
  uid: string; name: string; user_type: string; security_oauth_token: string
  refresh_token: string; machine_id: string; enabled: boolean; last_status: string
  last_error: string | null; quota: number; is_quota_exceeded: boolean
  plan: string | null; user_tag: string | null; next_reset_at: number | null
}
interface AccountsConfig { accounts: Account[]; active_uid: string | null }
interface UIStatus { ready: boolean; mode: string; username: string | null; uid: string | null; user_type: string | null; error: string | null; accounts_count: number }
interface APIConfig { auth_required: boolean; allowed_keys: string[] }
interface Message { role: 'user' | 'assistant'; content: string }
type TabId = 'dashboard' | 'accounts' | 'playground' | 'api-keys' | 'logs' | 'register'
type AppTabId = TabId
type Lang = 'en' | 'zh'
type ToastType = 'SUCCESS' | 'ERROR' | 'INFO'
interface ToastItem { id: number; type: ToastType; title: string; message: string }

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

const NAV_ITEMS: { id: AppTabId; icon: string; label: string }[] = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'accounts', icon: 'account_balance_wallet', label: 'Account Pool' },
  { id: 'playground', icon: 'smart_toy', label: 'AI Playground' },
  { id: 'api-keys', icon: 'vpn_key', label: 'API Key Management' },
  { id: 'register', icon: 'person_add', label: 'Auto Registrar' },
  { id: 'logs', icon: 'list_alt', label: 'Logs' },
]

const UI_TEXT = {
  en: {
    nav: {
      dashboard: 'Dashboard', accounts: 'Account Pool', playground: 'AI Playground', apiKeys: 'API Key Management', logs: 'Logs', register: 'Auto Registrar',
    },
    breadcrumb: {
      dashboard: 'Control Panel / Overview', accounts: 'Console / Management', playground: 'Playground / Experiment', apiKeys: 'Administration / Security', logs: 'System / Observability', docs: 'Developer Platform / Wiki', register: 'Automation / Registrar',
    },
    title: {
      dashboard: 'System Overview', accounts: 'Account Pool', playground: 'AI Playground', apiKeys: 'API Management', logs: 'Service Logs', docs: 'Documentation', register: 'Auto Registrar',
    },
    common: { docs: 'Docs', support: 'Support', healthy: 'Healthy', offline: 'Offline', signOut: 'Sign Out', refresh: 'Refresh', add: 'Add', delete: 'Delete', copy: 'Copy' },
    dashboard: {
      serviceStatus: 'Service Status', allGatewaysActive: 'All gateways active', noActiveSession: 'No active session', accountPool: 'Account Pool', activeSessions: 'Active Qoder accounts', apiAuth: 'API Auth', openAccess: 'Open access', activeUser: 'Active User', systemBriefing: 'System Briefing', readyBrief: 'Gateway is running. {count} account(s) are available for routing.', notReadyBrief: 'No active session is available. Import an account or add a PAT first.', recentNotifications: 'Recent Notifications', authImportError: 'Auth Import Error', sessionActive: 'Session Active', credentialConfig: 'Credential Configuration', credentialDesc: 'Add a Qoder PAT or import the current local Qoder auth session.', patPlaceholder: 'Enter Qoder PAT...', addPat: 'Add PAT', saving: 'Saving...', autoImport: 'Auto Import',
    },
    accounts: { desc: 'Manage Qoder accounts used by the gateway for request routing and failover.', refreshStatus: 'Refresh Status', importAccounts: 'Import Accounts', search: 'Search accounts...', empty: 'No accounts imported. Click Import Accounts or add a PAT from Dashboard.', showing: 'Showing {count} account(s)' },
    playground: { modelConfig: 'Model Configuration', streamResponse: 'Stream Response', systemPrompt: 'System Prompt', systemPromptPlaceholder: "Define the AI's persona...", ask: 'Ask anything...', send: 'Send', waiting: 'Waiting for response...' },
    api: { generate: 'Generate New Key', desc: 'Manage authentication keys and gateway access permissions for client requests.', gatewayAuth: 'Gateway Authentication', gatewayAuthDesc: 'Toggle API key validation for incoming /v1 requests.', systemStatus: 'System Status', activeKeys: 'Active Keys', configured: 'configured', activeAccessKeys: 'Active Access Keys', keyPlaceholder: 'Enter or paste a key...', noKeys: 'No API keys configured. Generate one above.', bestPractices: 'Security Best Practices', bestPracticesDesc: 'Do not expose API keys in client-side code. Rotate keys when they appear in logs, screenshots, or shared scripts.', securityPolicy: 'Security Policy' },
    logs: { account: 'Account', status: 'Status', range: 'Range', allAccounts: 'All Accounts', allStatuses: 'All Statuses', last24h: 'Last 24h', lastHour: 'Last hour', last7d: 'Last 7 days', noLogs: 'No logs available', noMatch: 'No logs match current filters', timestamp: 'Timestamp', level: 'Level', message: 'Message' },
    register: {
      desc: 'Register multiple Qoder accounts in parallel, pull device credentials and auto-save them into the pool. Browsers stay hidden in the background; each task pops to top once for human verification, then hides again — finish one, next takes its turn.',
      start: 'Start Registration',
      starting: 'Starting...',
      running: 'Tasks running',
      idle: 'Idle',
      stageLabel: 'Stage',
      statusLabel: 'Status',
      logs: 'Live Logs',
      result: 'Registration Result (auto-imported)',
      noResult: 'No task has run yet',
      countLabel: 'Parent Threads',
      staggerHint: 'Each parent loops forever: 3 child tasks per batch, next batch starts automatically until you click stop',
      stop: 'Stop Registration',
      stopping: 'Stopping (after current batch)...',
      stopHint: 'Stops after the current batch finishes and reports this run\'s stats',
      verifyHint: 'Complete the human verification in the topmost browser window (slide the slider); next task takes over automatically',
      waiting: 'Waiting for human verification',
      task: 'Task',
      statsLabel: 'This Run Stats',
      success: 'Success',
      failed: 'Failed',
      total: 'Total',
      activeTasks: 'Running',
      recentTasks: 'Recent Done',
      stage: {
        idle: 'Idle', registering: 'Registering', waiting_slider: 'Waiting for human verification (topmost)', waiting_otp: 'Waiting for email code', device_auth: 'Device authorization', saving: 'Saving to DB', success: 'Success', failed: 'Failed',
      },
    },
  },
  zh: {
    nav: {
      dashboard: '控制台', accounts: '账号池', playground: '调试对话', apiKeys: 'API Key 管理', logs: '服务日志', register: '自动注册机',
    },
    breadcrumb: {
      dashboard: '控制台 / 概览', accounts: '控制台 / 账号管理', playground: '调试 / 对话测试', apiKeys: '管理 / 安全', logs: '系统 / 日志', docs: '开发者平台 / 文档', register: '自动化 / 注册机',
    },
    title: {
      dashboard: '系统概览', accounts: '账号池', playground: '调试对话', apiKeys: 'API 管理', logs: '服务日志', docs: '文档', register: '自动注册机',
    },
    common: { docs: '文档', support: '支持', healthy: '正常', offline: '未就绪', signOut: '退出', refresh: '刷新', add: '添加', delete: '删除', copy: '复制' },
    dashboard: {
      serviceStatus: '服务状态', allGatewaysActive: '网关可用', noActiveSession: '没有可用账号', accountPool: '账号池', activeSessions: '可参与路由的 Qoder 账号', apiAuth: 'API 鉴权', openAccess: '未开启鉴权', activeUser: '当前账号', systemBriefing: '运行状态', readyBrief: '网关正在运行，当前有 {count} 个账号可用于请求路由。', notReadyBrief: '当前没有可用会话，请先导入账号或添加 PAT。', recentNotifications: '最近状态', authImportError: '本地登录导入失败', sessionActive: '账号已连接', credentialConfig: '凭据配置', credentialDesc: '添加 Qoder PAT，或导入本机已有的 Qoder 登录会话。', patPlaceholder: '输入 Qoder PAT...', addPat: '添加 PAT', saving: '保存中...', autoImport: '自动导入',
    },
    accounts: { desc: '管理网关用于请求路由和失败切换的 Qoder 账号。', refreshStatus: '刷新状态', importAccounts: '导入账号', search: '搜索账号...', empty: '还没有导入账号。点击导入账号，或在控制台添加 PAT。', showing: '共 {count} 个账号' },
    playground: { modelConfig: '模型配置', streamResponse: '流式响应', systemPrompt: '系统提示词', systemPromptPlaceholder: '定义模型的角色或行为...', ask: '输入要发送的内容...', send: '发送', waiting: '正在等待响应...' },
    api: { generate: '生成新 Key', desc: '管理客户端请求网关时使用的 API Key 和访问权限。', gatewayAuth: '网关 API 鉴权', gatewayAuthDesc: '控制 /v1 请求是否必须携带 API Key。', systemStatus: '系统状态', activeKeys: '可用 Key', configured: '已配置', activeAccessKeys: '已启用的 API Key', keyPlaceholder: '输入或粘贴 API Key...', noKeys: '还没有配置 API Key。请先生成并添加。', bestPractices: '安全建议', bestPracticesDesc: '不要把 API Key 写在前端代码里。如果 Key 出现在日志、截图或共享脚本中，请及时删除并重新生成。', securityPolicy: '安全策略' },
    logs: { account: '账号', status: '级别', range: '时间范围', allAccounts: '全部账号', allStatuses: '全部级别', last24h: '最近 24 小时', lastHour: '最近 1 小时', last7d: '最近 7 天', noLogs: '暂无日志', noMatch: '没有匹配当前筛选条件的日志', timestamp: '时间', level: '级别', message: '内容' },
    register: {
      desc: '并行注册多个 Qoder 账号并拉取 Device 凭据，成功后自动入库。浏览器平时隐藏后台，人机验证时置顶显示，划完一个自动轮到下一个。',
      start: '开始注册',
      starting: '启动中...',
      running: '任务运行中',
      idle: '空闲',
      stageLabel: '阶段',
      statusLabel: '状态',
      logs: '实时日志',
      result: '注册结果（已自动入库）',
      noResult: '尚未运行注册任务',
      countLabel: '母线程数',
      staggerHint: '每个母线程无限循环：每批 3 个子任务并发，注册完一批自动开下一批，直到点击停止',
      stop: '停止注册',
      stopping: '停止中（当前批完成后停）...',
      stopHint: '当前批次完成后停止，统计本次注册数',
      verifyHint: '请在置顶的浏览器窗口中完成人机验证（滑动滑块），划完自动轮到下一个',
      waiting: '等待人工验证',
      task: '任务',
      statsLabel: '本次注册统计',
      success: '成功',
      failed: '失败',
      total: '总计',
      activeTasks: '运行中任务',
      recentTasks: '最近完成',
      stage: {
        idle: '空闲', registering: '正在注册', waiting_slider: '等待人机验证（已置顶）', waiting_otp: '等待邮箱验证码', device_auth: 'Device 授权中', saving: '入库中', success: '注册成功', failed: '失败',
      },
    },
  },
} as const

const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconFill: string }> = {
  SUCCESS: { bg: 'bg-white', border: 'border-l-[3px] border-l-mint', icon: 'check_circle', iconFill: 'text-mint' },
  ERROR: { bg: 'bg-white', border: 'border-l-[3px] border-l-toast-error', icon: 'error', iconFill: 'text-toast-error' },
  INFO: { bg: 'bg-white', border: 'border-l-[3px] border-l-sky', icon: 'info', iconFill: 'text-sky' },
}

// ─── Toast Context ───

const ToastCtx = createContext<{ push: (t: ToastType, title: string, message: string) => void }>({ push: () => {} })

// ─── Custom UI Components ───

function CustomCheckbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-sm font-bold text-ink cursor-pointer group select-none"
    >
      <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
        checked ? 'bg-ink border-ink' : 'bg-white border-hairline-strong group-hover:border-ink/40'
      }`}>
        {checked && <span className="material-symbols-outlined text-white" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>check</span>}
      </span>
      {label}
    </button>
  )
}

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
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-11 bg-canvas-soft border border-hairline rounded-lg px-3 text-sm text-ink flex items-center justify-between focus:outline-none focus:border-hairline-strong hover:border-hairline-strong transition-colors cursor-pointer"
      >
        <span className={selected ? 'text-ink' : 'text-body/50'}>{selected?.label || placeholder || 'Select...'}</span>
        <span className={`material-symbols-outlined text-body text-[18px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>
      {open && (
        <div className="custom-select-dropdown absolute top-full left-0 right-0 mt-1 bg-white border border-hairline rounded-lg shadow-lg z-[6000] overflow-hidden">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full px-3 py-2 text-sm text-left transition-colors ${
                opt.value === value ? 'bg-canvas-soft text-ink font-medium' : 'text-body hover:bg-canvas-soft hover:text-ink'
              }`}
            >
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
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full bg-canvas-soft border border-hairline text-ink text-sm px-3.5 py-2.5 rounded-lg outline-none focus:border-hairline-strong focus:bg-white transition-colors placeholder:text-body/50 ${mono ? 'font-mono' : ''} ${className}`}
    />
  )
}

function CustomTextarea({ value, onChange, placeholder, className = '', rows }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`custom-textarea w-full bg-white border border-hairline-strong text-ink text-sm px-4 py-3 rounded-xl outline-none focus:border-ink focus:ring-2 focus:ring-ink/10 transition-all placeholder:text-body/40 resize-none ${className}`}
    />
  )
}

// ─── Toast Container ───

function ToastContainer({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    toasts.forEach(t => {
      const el = itemRefs.current.get(t.id)
      if (!el || el.dataset.animated === '1') return
      el.dataset.animated = '1'
      gsap.fromTo(el,
        { opacity: 0, x: 60, scale: 0.92 },
        { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: 'back.out(1.2)' }
      )
    })
  }, [toasts])

  const handleDismiss = (id: number) => {
    const el = itemRefs.current.get(id)
    if (el) {
      gsap.to(el, {
        opacity: 0, x: 60, scale: 0.92, duration: 0.25, ease: 'power2.in',
        onComplete: () => dismiss(id)
      })
    } else {
      dismiss(id)
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col-reverse gap-3 pointer-events-none" style={{ maxWidth: '380px' }}>
      {toasts.map(t => {
        const s = TOAST_STYLES[t.type]
        return (
          <div
            key={t.id}
            ref={el => { if (el) itemRefs.current.set(t.id, el) }}
            className={`pointer-events-auto ${s.bg} ${s.border} border border-hairline rounded-xl shadow-lg p-3.5 flex items-start gap-3 min-w-[280px] max-w-[380px]`}
          >
            <span className={`material-symbols-outlined ${s.iconFill} mt-0.5 shrink-0`} style={{ fontVariationSettings: "'FILL' 1", fontSize: '18px' }}>{s.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-ink">{t.title}</div>
              <div className="text-[11px] text-body mt-0.5 leading-relaxed break-words">{t.message}</div>
            </div>
            <button onClick={() => handleDismiss(t.id)} className="text-body/40 hover:text-ink transition-colors shrink-0 mt-0.5">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          </div>
        )
      })}
    </div>
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
  const [loading, setLoading] = useState(true)

  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Hello! I am the QoderGate AI assistant. Ask me anything — I support Markdown and LaTeX math.' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [model, setModel] = useState('auto')
  const [stream, setStream] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [showThinking, setShowThinking] = useState(true)

  const [newKey, setNewKey] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [patToken, setPatToken] = useState('')
  const [submittingPat, setSubmittingPat] = useState(false)
  const [searchAccounts, setSearchAccounts] = useState('')
  const [usageData, setUsageData] = useState<any>(null)
  const [claiming, setClaiming] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchJson, setBatchJson] = useState('')
  const [refreshingTokens, setRefreshingTokens] = useState(false)
  const [quotaList, setQuotaList] = useState<{ uid: string; name: string; quota: { userQuota: { total: number; used: number; remaining: number; percentage: number } } }[] | null>(null)

  const [logFilterAccount, setLogFilterAccount] = useState('all')
  const [logFilterStatus, setLogFilterStatus] = useState('all')
  const [logFilterRange, setLogFilterRange] = useState('24h')

  const [regStatus, setRegStatus] = useState<RegStatus | null>(null)
  const [regStarting, setRegStarting] = useState(false)
  const [regStopping, setRegStopping] = useState(false)
  const [regCount, setRegCount] = useState(2)

  const switchLang = (next: Lang) => {
    setLang(next)
    localStorage.setItem('qodergate_lang', next)
  }
  const t = UI_TEXT[lang]
  const msg = {
    imported: (name: string) => lang === 'zh' ? `已导入账号：${name}` : `Imported account: ${name}`,
    importFailed: lang === 'zh' ? '导入失败' : 'Import Failed',
    patAdded: (name: string) => lang === 'zh' ? `账号“${name}”已加入账号池` : `Account "${name}" added to pool`,
    patFailed: lang === 'zh' ? 'PAT 添加失败' : 'PAT Failed',
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
    logsRefreshed: lang === 'zh' ? '日志已刷新' : 'Logs Refreshed',
    aiFailed: lang === 'zh' ? 'AI 请求失败' : 'AI Request Failed',
    responseDone: lang === 'zh' ? '响应已完成' : 'Response Complete',
    connectionError: lang === 'zh' ? '连接失败' : 'Connection Error',
  }
  const navLabels: Record<AppTabId, string> = {
    dashboard: t.nav.dashboard,
    accounts: t.nav.accounts,
    playground: t.nav.playground,
    'api-keys': t.nav.apiKeys,
    logs: t.nav.logs,
    register: t.nav.register,
  }
  const navShort: Record<AppTabId, string> = {
    dashboard: lang === 'zh' ? '控制台' : 'Home',
    accounts: lang === 'zh' ? '账号池' : 'Accounts',
    playground: lang === 'zh' ? '调试' : 'Playground',
    'api-keys': lang === 'zh' ? '密钥' : 'Keys',
    register: lang === 'zh' ? '注册' : 'Register',
    logs: lang === 'zh' ? '日志' : 'Logs',
  }
  const pageMeta: Record<AppTabId, { bc: string; title: string }> = {
    dashboard: { bc: t.breadcrumb.dashboard, title: t.title.dashboard },
    accounts: { bc: t.breadcrumb.accounts, title: t.title.accounts },
    playground: { bc: t.breadcrumb.playground, title: t.title.playground },
    'api-keys': { bc: t.breadcrumb.apiKeys, title: t.title.apiKeys },
    logs: { bc: t.breadcrumb.logs, title: t.title.logs },
    register: { bc: t.breadcrumb.register, title: t.title.register },
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
          gsap.to(el, { opacity: 0, x: 60, scale: 0.92, duration: 0.25, ease: 'power2.in' })
          setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 260)
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
    try { const resp = await authedFetch('/ui/status'); const data = await resp.json(); setStatus(data) } catch { /* */ } finally { setLoading(false) }
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

  const handleClaimDaily = async () => {
    setClaiming(true)
    try {
      const resp = await authedFetch('/ui/claim', { method: 'POST', body: JSON.stringify({}) })
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
        setBatchJson(''); setShowBatchImport(false); fetchAccounts()
      } else { pushToast('ERROR', lang === 'zh' ? '导入失败' : 'Import failed', data.detail || '') }
    } catch { pushToast('ERROR', lang === 'zh' ? '导入失败' : 'Import failed', '') }
  }, [authedFetch, batchJson, lang, fetchAccounts, pushToast])

  const doRefreshTokens = useCallback(async () => {
    setRefreshingTokens(true)
    try {
      const resp = await authedFetch('/ui/accounts/refresh-tokens', { method: 'POST' })
      const data = await resp.json()
      if (data.status === 'ok') {
        pushToast('SUCCESS', lang === 'zh' ? `刷新完成 ${data.ok}/${data.total}` : `Refreshed ${data.ok}/${data.total}`, lang === 'zh' ? `失败 ${data.failed}` : `failed ${data.failed}`)
      } else { pushToast('ERROR', lang === 'zh' ? '刷新失败' : 'Refresh failed', data.error || '') }
    } catch { pushToast('ERROR', lang === 'zh' ? '刷新失败' : 'Refresh failed', '') } finally { setRefreshingTokens(false) }
  }, [authedFetch, lang, pushToast])

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parents: regCount }),
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
    fetchStatus(); fetchAccounts(); fetchApiConfig(); fetchUsageOverview(); fetchLogs(); fetchRegStatus()
    const si = setInterval(fetchStatus, 6000)
    const li = setInterval(() => { if (activeTab === 'logs') fetchLogs() }, 3000)
    const ri = setInterval(() => { if (activeTab === 'register' && regStatus?.running) fetchRegStatus() }, 2000)
    return () => { clearInterval(si); clearInterval(li); clearInterval(ri) }
  }, [token, activeTab, fetchStatus, fetchAccounts, fetchApiConfig, fetchLogs, fetchRegStatus, regStatus?.running])

  useEffect(() => { if (activeTab === 'logs') logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [logs, activeTab])
  useEffect(() => { if (activeTab === 'playground') chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages, activeTab])

  // GSAP animations
  useEffect(() => { if (!token && loginCardRef.current) gsap.fromTo(loginCardRef.current, { scale: 0.94, opacity: 0, y: 20 }, { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }) }, [token])
  useEffect(() => { if (token && contentBodyRef.current) gsap.fromTo(contentBodyRef.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }) }, [activeTab, token])
  useEffect(() => {
    if (token && activeTab === 'dashboard' && statCardsRef.current) {
      const cards = statCardsRef.current.querySelectorAll('.stat-card')
      gsap.fromTo(cards, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.05, ease: 'power2.out' })
    }
  }, [activeTab, token, status])

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
          gsap.to(loginCardRef.current, { scale: 1.02, duration: 0.3, ease: 'power2.out', onComplete: () => { localStorage.setItem('gateway_token', trimmed); setToken(trimmed); setInputToken('') } })
        }
      } else {
        if (loginCardRef.current) gsap.to(loginCardRef.current, { x: 10, duration: 0.04, repeat: 7, yoyo: true, onComplete: () => gsap.set(loginCardRef.current!, { x: 0 }) })
        setAuthError('Invalid gateway access token')
      }
    } catch (err: any) { setAuthError(`Connection failed: ${err.message}`) } finally { setVerifying(false) }
  }

  const handleLogout = () => { localStorage.removeItem('gateway_token'); setToken(null); setLoginSuccess(false) }

  const handleImportAuth = async () => {
    setLoading(true)
    try {
      const resp = await authedFetch('/ui/accounts/import', { method: 'POST' })
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'Import failed') }
      const data = await resp.json()
      pushToast('SUCCESS', lang === 'zh' ? '账号已导入' : 'Account Imported', msg.imported(data.account?.name || (lang === 'zh' ? '本地会话' : 'local session')))
      fetchAccounts(); fetchStatus(); fetchLogs()
    } catch (err: any) {
      pushToast('ERROR', msg.importFailed, err.message)
    } finally { setLoading(false) }
  }

  const handleSavePat = async () => {
    if (!patToken.trim()) return
    setSubmittingPat(true)
    try {
      const resp = await authedFetch('/ui/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pat: patToken }) })
      if (!resp.ok) { const err = await resp.json(); throw new Error(err.detail || 'PAT save failed') }
      const data = await resp.json()
      pushToast('SUCCESS', lang === 'zh' ? 'PAT 已添加' : 'PAT Added', msg.patAdded(data.name || 'PAT Account'))
      setPatToken(''); fetchAccounts(); fetchStatus(); fetchLogs()
    } catch (err: any) {
      pushToast('ERROR', msg.patFailed, err.message)
    } finally { setSubmittingPat(false) }
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
    if (!confirm('Delete this account from the database?')) return
    try {
      const resp = await authedFetch(`/ui/accounts/${uid}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Delete failed')
      pushToast('SUCCESS', lang === 'zh' ? '账号已删除' : 'Account Deleted', msg.deleted(uid))
      fetchAccounts(); fetchStatus(); fetchLogs()
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

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    pushToast('INFO', lang === 'zh' ? '已复制' : 'Copied', msg.copied)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handleRefreshStatus = () => {
    fetchAccounts(); fetchStatus(); fetchLogs()
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
            try { const parsed = JSON.parse(rawData); const chunk = parsed.choices?.[0]?.delta?.content || ''; currentResponse += chunk; setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: currentResponse }; return u }) } catch { /* */ }
          }
        }
        pushToast('SUCCESS', msg.responseDone, lang === 'zh' ? '流式响应已结束' : 'AI response stream finished successfully')
      } else {
        const data = await response.json()
        const ans = data.choices?.[0]?.message?.content || ''
        setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: 'assistant', content: ans }; return u })
        pushToast('SUCCESS', msg.responseDone, lang === 'zh' ? '已收到 AI 响应' : 'AI response received successfully')
      }
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
    { value: 'all', label: 'All Accounts' },
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
  // ─── LOGIN PAGE ───
  if (!token) {
    return (
      <div className="bg-surface text-ink min-h-screen flex items-center justify-center p-4">
        <main ref={loginCardRef} className="w-full max-w-[400px]">
          <div className="card p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-10 h-10 bg-ink rounded-xl flex items-center justify-center mb-3">
                <span className="material-symbols-outlined text-white text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>gate</span>
              </div>
              <h1 className="text-xl font-semibold text-ink">QoderGate</h1>
              <p className="text-[11px] text-body mt-1 uppercase tracking-widest">{lang === 'zh' ? '管理控制台' : 'Management Console'}</p>
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
              <button className={`w-full py-3 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm font-medium ${loginSuccess ? 'bg-mint text-white' : 'bg-ink text-white hover:bg-primary'} disabled:opacity-50`} type="submit" disabled={verifying}>
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
            <span className="text-[10px] text-body flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-mint"></span>
              {lang === 'zh' ? '运行中' : 'Operational'}
            </span>
          </div>
        </main>
      </div>
    )
  }

  // ─── MAIN LAYOUT ───
  const { title } = pageMeta[activeTab]

  return (
    <div className="bg-surface min-h-screen flex flex-col">
      {/* Top bar - minimal */}
      <header className="sticky top-0 z-40 bg-surface/80 backdrop-blur-md border-b border-hairline">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ink rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>gate</span>
            </div>
            <h1 className="font-display-sm text-ink">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => switchLang(lang === 'zh' ? 'en' : 'zh')} className="px-3 py-1.5 text-xs font-medium text-body hover:text-ink hover:bg-canvas-soft rounded-lg transition-colors">
              {lang === 'zh' ? 'EN' : '中文'}
            </button>
            <a href="/documents" className="px-3 py-1.5 text-xs font-medium text-body hover:text-ink hover:bg-canvas-soft rounded-lg transition-colors">
              {t.common.docs}
            </a>
            <div className="w-px h-5 bg-hairline mx-1"></div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${status.ready ? 'bg-mint' : 'bg-red-400'}`}></span>
              <span className="text-xs text-body">{status.username || 'QoderGate'}</span>
            </div>
            <button onClick={handleLogout} className="p-1.5 text-body hover:text-red-600 transition-colors" title={t.common.signOut}>
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 pb-24">
        <div ref={contentBodyRef} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          {/* ─── DASHBOARD ─── */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* KPI Row - 5 columns */}
              {(() => {
                const campaigns = usageData?.campaigns?.campaigns || []
                const targetC = campaigns.find((c: any) => c.actionType === 'CLAIM_BENEFIT') || campaigns[0]
                const isClaimed = targetC?.claimStatus === 'CLAIMED'
                const uq = usageData?.quota?.userQuota || { total: 300, used: 0, remaining: 300 }
                const addOn = usageData?.quota?.addOnQuota || { remaining: 0, total: 0, used: 0 }

                return (
                  <section ref={statCardsRef} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {/* Service Status */}
                    <div className="stat-card card p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-medium text-body uppercase tracking-wide">{t.dashboard.serviceStatus}</span>
                        <span className={`w-2 h-2 rounded-full ${status.ready ? 'bg-mint' : 'bg-red-400'}`}></span>
                      </div>
                      <div className="text-lg font-semibold text-ink">{status.ready ? t.common.healthy : t.common.offline}</div>
                      <div className="text-[11px] text-body mt-1">{status.ready ? t.dashboard.allGatewaysActive : t.dashboard.noActiveSession}</div>
                    </div>

                    {/* Account Pool */}
                    <div className="stat-card card p-4">
                      <div className="text-[11px] font-medium text-body uppercase tracking-wide mb-2">{t.dashboard.accountPool}</div>
                      <div className="text-lg font-semibold text-ink">{status.accounts_count || 0}</div>
                      <div className="text-[11px] text-body mt-1">{t.dashboard.activeSessions}</div>
                    </div>

                    {/* Plan Quota */}
                    <div className="stat-card card p-4">
                      <div className="text-[11px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '主配额' : 'Plan Quota'}</div>
                      <div className="text-lg font-semibold text-ink">{uq.remaining}<span className="text-xs font-normal text-body">/{uq.total}</span></div>
                      <div className="w-full bg-hairline h-1 rounded-full mt-2 overflow-hidden">
                        <div className="bg-ink h-full rounded-full transition-all" style={{ width: `${Math.min(100, ((uq.used || 0) / (uq.total || 300)) * 100)}%` }}></div>
                      </div>
                    </div>

                    {/* Add-on Credits */}
                    <div className="stat-card card p-4">
                      <div className="text-[11px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '签到算力' : 'Add-on'}</div>
                      <div className="text-lg font-semibold text-peach">{addOn.remaining}</div>
                      <div className="text-[11px] text-body mt-1">{lang === 'zh' ? '30天滚动有效' : '30-day rolling'}</div>
                    </div>

                    {/* Daily Check-in */}
                    <div className="stat-card card p-4 col-span-2 md:col-span-1">
                      <div className="text-[11px] font-medium text-body uppercase tracking-wide mb-2">{lang === 'zh' ? '每日签到' : 'Check-in'}</div>
                      {isClaimed ? (
                        <div className="flex items-center gap-1.5 text-mint">
                          <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          <span className="text-sm font-medium">{lang === 'zh' ? '已领 100' : 'Claimed'}</span>
                        </div>
                      ) : (
                        <button
                          onClick={handleClaimDaily}
                          disabled={claiming}
                          className="w-full px-3 py-1.5 bg-peach text-white text-xs font-medium rounded-lg hover:bg-peach/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">card_giftcard</span>
                          {claiming ? '...' : (lang === 'zh' ? '打卡领取' : 'Claim')}
                        </button>
                      )}
                      <div className="text-[11px] text-body mt-1.5">{lang === 'zh' ? '每日 10:05 自动' : 'Auto at 10:05'}</div>
                    </div>
                  </section>
                )
              })()}

              {/* Usage Analytics - 3 columns compact */}
              {(() => {
                const uq = usageData?.quota?.userQuota || { total: 300, used: 0, remaining: 300 }
                const addOn = usageData?.quota?.addOnQuota || { total: 0, remaining: 0, used: 0 }
                const expiresAt = usageData?.quota?.expiresAt ? new Date(usageData.quota.expiresAt).toLocaleDateString('zh-CN') : '2026/11/20'
                const userType = usageData?.quota?.userType || 'personal_professional_trial'
                const usedPct = Math.min(100, Math.round(((uq.used || 0) / (uq.total || 300)) * 100))

                return (
                  <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Plan Quota Detail */}
                    <div className="card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-body">{lang === 'zh' ? '主套餐月度配额' : 'Plan Quota'}</span>
                        <span className="text-xs font-semibold text-ink">{usedPct}%</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="text-2xl font-semibold text-ink">{uq.remaining}</span>
                        <span className="text-xs text-body">/ {uq.total} Credits</span>
                      </div>
                      <div className="w-full bg-hairline h-1.5 rounded-full overflow-hidden">
                        <div className="bg-ink h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(2, usedPct)}%` }}></div>
                      </div>
                      <div className="flex justify-between mt-3 text-[11px] text-body">
                        <span>{lang === 'zh' ? '已用' : 'Used'}: {uq.used}</span>
                        <span className="text-mint font-medium">{lang === 'zh' ? '状态良好' : 'Healthy'}</span>
                      </div>
                    </div>

                    {/* Add-on Credits */}
                    <div className="card p-5">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium text-body">{lang === 'zh' ? '通用签到算力' : 'Add-on Credits'}</span>
                        <span className="text-xs font-semibold text-peach">{lang === 'zh' ? '30天滚动' : '30-day'}</span>
                      </div>
                      <div className="flex items-baseline gap-1.5 mb-3">
                        <span className="text-2xl font-semibold text-peach">{addOn.remaining}</span>
                        <span className="text-xs text-body">Credits</span>
                      </div>
                      <p className="text-[11px] text-body leading-relaxed">
                        {lang === 'zh' ? '每日签到赠送，优先级最高抵扣，持续打卡储备算力。' : 'Daily check-in reward, highest priority deduction.'}
                      </p>
                    </div>

                    {/* Account Plan */}
                    <div className="card p-5">
                      <div className="text-xs font-medium text-body mb-3">{lang === 'zh' ? '账号权限与有效期' : 'Account Plan'}</div>
                      <div className="text-sm font-semibold text-ink mb-2">
                        {userType === 'personal_professional_trial' ? (lang === 'zh' ? '个人专业试用版' : 'Pro Trial') : userType}
                      </div>
                      <div className="text-[11px] text-body mb-3">
                        {lang === 'zh' ? '有效期至' : 'Valid until'}: <span className="font-mono font-medium text-ink">{expiresAt}</span>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-hairline">
                        <span className="flex items-center gap-1 text-[11px] text-mint font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-mint"></span> {lang === 'zh' ? '正常轮转' : 'Active'}
                        </span>
                        <button onClick={fetchUsageOverview} className="text-[11px] text-body hover:text-ink flex items-center gap-0.5 transition-colors">
                          <span className="material-symbols-outlined text-[14px]">sync</span> {lang === 'zh' ? '刷新' : 'Refresh'}
                        </button>
                      </div>
                    </div>
                  </section>
                )
              })()}

              {/* Client Integration - compact */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-body">devices</span>
                    <span className="text-sm font-medium text-ink">{lang === 'zh' ? '客户端接入' : 'Client Integration'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="px-2 py-0.5 bg-mint-soft text-mint text-[10px] font-medium rounded flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">bolt</span> 1M Context
                    </span>
                    <span className="px-2 py-0.5 bg-sky-soft text-sky text-[10px] font-medium rounded flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">psychology</span> xhigh/max
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="card-soft p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-body uppercase tracking-wide">Base URL</div>
                      <div className="text-xs font-mono text-ink truncate mt-0.5">http://192.168.31.172:5050/v1</div>
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText('http://192.168.31.172:5050/v1'); pushToast('SUCCESS', lang === 'zh' ? '已复制' : 'Copied', 'Base URL') }}
                      className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                  </div>
                  <div className="card-soft p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] text-body uppercase tracking-wide">API Key</div>
                      <div className="text-xs font-mono text-ink truncate mt-0.5">{apiConfig.allowed_keys[0] || 'qg_live_***'}</div>
                    </div>
                    <button
                      onClick={() => { const key = apiConfig.allowed_keys[0] || ''; navigator.clipboard.writeText(key); pushToast('SUCCESS', lang === 'zh' ? '已复制' : 'Copied', 'API Key') }}
                      className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded transition-colors shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">content_copy</span>
                    </button>
                  </div>
                </div>
              </section>

              {/* Model Matrix Hub */}
              <section className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-body">hub</span>
                    <span className="text-sm font-medium text-ink">{lang === 'zh' ? '模型矩阵' : 'Model Matrix'}</span>
                    <span className="text-[11px] text-body">11 {lang === 'zh' ? '款可用' : 'available'}</span>
                  </div>
                  <span className="text-[10px] text-body">{lang === 'zh' ? '点击复制 ID' : 'Click to copy'}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AVAILABLE_MODELS.map(m => (
                    <div
                      key={m.id}
                      onClick={() => { navigator.clipboard.writeText(m.id); pushToast('SUCCESS', lang === 'zh' ? '已复制' : 'Copied', m.id) }}
                      className="card-soft p-3 hover:bg-hairline/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs font-medium text-ink truncate">{m.name}</span>
                        {m.free && <span className="px-1.5 py-0.5 bg-mint-soft text-mint text-[9px] font-medium rounded shrink-0">FREE</span>}
                      </div>
                      <div className="text-[10px] text-body line-clamp-1 mb-2">{m.desc}</div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="px-1.5 py-0.5 bg-hairline text-ink rounded font-mono">{m.context}</span>
                        <span className="px-1.5 py-0.5 bg-sky-soft text-sky rounded font-mono">{m.effort}</span>
                        <span className="text-body ml-auto font-mono">{m.price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Credential Config */}
              <section className="card p-5">
                <div className="text-xs font-medium text-body mb-1">{t.dashboard.credentialConfig}</div>
                <p className="text-xs text-body mb-4">{t.dashboard.credentialDesc}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-grow">
                    <CustomInput type="password" value={patToken} onChange={setPatToken} placeholder={t.dashboard.patPlaceholder} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSavePat} disabled={submittingPat} className="px-4 py-2.5 bg-ink text-white text-sm font-medium rounded-lg hover:bg-primary transition-colors disabled:opacity-50">
                      {submittingPat ? t.dashboard.saving : t.dashboard.addPat}
                    </button>
                    <button onClick={handleImportAuth} className="px-4 py-2.5 text-ink border border-hairline text-sm font-medium rounded-lg hover:bg-canvas-soft transition-colors flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">refresh</span>{t.dashboard.autoImport}
                    </button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ─── ACCOUNT POOL ─── */}
          {activeTab === 'accounts' && (
            <div className="space-y-5">
              {/* Toolbar */}
              <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-body">{t.accounts.desc}</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => { setShowBatchImport(v => !v); setQuotaList(null) }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${showBatchImport ? 'bg-ink text-white border-ink' : 'text-body border-hairline hover:text-ink hover:bg-canvas-soft'}`}>
                    <span className="material-symbols-outlined text-[16px]">file_upload</span>{lang === 'zh' ? '批量导入' : 'Batch Import'}
                  </button>
                  <button onClick={doRefreshTokens} disabled={refreshingTokens} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-body hover:text-ink hover:bg-canvas-soft transition-colors disabled:opacity-40">
                    <span className="material-symbols-outlined text-[16px]">autorenew</span>{refreshingTokens ? (lang === 'zh' ? '刷新中...' : 'Refreshing...') : (lang === 'zh' ? '刷新 Token' : 'Refresh Tokens')}
                  </button>
                  <button onClick={() => { loadQuota(); setShowBatchImport(false) }} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${quotaList ? 'bg-ink text-white border-ink' : 'text-body border-hairline hover:text-ink hover:bg-canvas-soft'}`}>
                    <span className="material-symbols-outlined text-[16px]">data_usage</span>{lang === 'zh' ? '查看限额' : 'Quota'}
                  </button>
                  <button onClick={handleRefreshStatus} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-body hover:text-ink hover:bg-canvas-soft transition-colors">
                    <span className="material-symbols-outlined text-[16px]">refresh</span>{t.accounts.refreshStatus}
                  </button>
                  <button onClick={handleImportAuth} className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-lg hover:bg-primary transition-colors text-xs font-medium">
                    <span className="material-symbols-outlined text-[16px]">add</span>{t.accounts.importAccounts}
                  </button>
                </div>
              </section>

              {showBatchImport && (
                <section className="card p-5">
                  <label className="text-xs font-medium text-body mb-2 block">{lang === 'zh' ? '粘贴注册机导出的 JSON（accounts.json）' : 'Paste registrar-exported JSON (accounts.json)'}</label>
                  <textarea
                    value={batchJson}
                    onChange={e => setBatchJson(e.target.value)}
                    rows={6}
                    placeholder='[{ "user_id": "019f...", "name": "...", "email": "...", "token": "dt-...", "refresh_token": "drt-...", "expires_at": "..." }]'
                    className="w-full p-3 rounded-lg border border-hairline bg-canvas-soft font-mono text-xs text-ink outline-none focus:border-hairline-strong focus:bg-white transition-colors"
                  />
                  <div className="mt-3 flex gap-2">
                    <button onClick={doBatchImport} className="bg-ink text-white font-medium px-4 py-2 rounded-lg text-xs hover:bg-primary transition-colors">{lang === 'zh' ? '导入' : 'Import'}</button>
                    <button onClick={() => { setBatchJson(''); setShowBatchImport(false) }} className="px-4 py-2 text-body border border-hairline rounded-lg text-xs font-medium hover:text-ink hover:bg-canvas-soft transition-colors">{lang === 'zh' ? '取消' : 'Cancel'}</button>
                  </div>
                </section>
              )}

              {quotaList && (
                <section className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-hairline flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-body">data_usage</span>
                    <span className="text-xs font-medium text-ink">{lang === 'zh' ? '账号限额（Credits）' : 'Account Quota (Credits)'}</span>
                    <button onClick={loadQuota} className="ml-auto text-[11px] text-body hover:text-ink flex items-center gap-1 transition-colors"><span className="material-symbols-outlined text-[14px]">refresh</span>{lang === 'zh' ? '刷新' : 'Refresh'}</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-hairline">{['Account', 'Total', 'Used', 'Remaining', 'Usage'].map((h, i) => (
                          <th key={i} className="px-5 py-2.5 text-[10px] font-medium text-body uppercase tracking-wide">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {quotaList.map((q, i) => {
                          const uq = q.quota?.userQuota || {}
                          const pct = Math.min(100, (uq.percentage || 0) * 100)
                          return (
                            <tr key={i} className="hover:bg-canvas-soft transition-colors">
                              <td className="px-5 py-3 text-xs font-medium text-ink">{q.name || q.uid.slice(0, 12)}</td>
                              <td className="px-5 py-3 font-mono text-xs text-body">{uq.total ?? '--'}</td>
                              <td className="px-5 py-3 font-mono text-xs text-body">{uq.used ?? '--'}</td>
                              <td className={`px-5 py-3 font-mono text-xs ${pct > 80 ? 'text-toast-error font-medium' : 'text-body'}`}>{uq.remaining ?? '--'}</td>
                              <td className="px-5 py-3">
                                <div className="w-24 h-1.5 bg-hairline rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${pct > 80 ? 'bg-toast-error' : 'bg-mint'}`} style={{ width: `${pct}%` }} />
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                        {quotaList.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-xs text-body">{lang === 'zh' ? '暂无账号' : 'No accounts'}</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* Search */}
              <div className="relative max-w-sm">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-body text-[18px]">search</span>
                <input
                  value={searchAccounts}
                  onChange={e => setSearchAccounts(e.target.value)}
                  placeholder={t.accounts.search}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-hairline rounded-xl text-sm text-ink outline-none focus:border-hairline-strong transition-colors placeholder:text-body/50"
                />
              </div>

              {/* Accounts table */}
              <section className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft">{['Account', 'UID', 'Plan / Quota', 'Status', 'Reset', 'Enabled', 'Actions'].map((h, i) => (
                        <th key={i} className={`px-5 py-3 text-[10px] font-medium text-body uppercase tracking-wide ${i === 5 ? 'text-center' : ''}`}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {accountsConfig.accounts.length === 0 ? (
                        <tr><td colSpan={7} className="py-10 text-center text-xs text-body">{t.accounts.empty}</td></tr>
                      ) : accountsConfig.accounts
                        .filter(acc => !searchAccounts || acc.name.toLowerCase().includes(searchAccounts.toLowerCase()) || acc.uid.includes(searchAccounts))
                        .map((acc) => {
                          const isActive = accountsConfig.active_uid === acc.uid
                          return (
                            <tr key={acc.uid} className={`hover:bg-canvas-soft transition-colors group ${isActive ? 'bg-mint-soft/30' : ''}`}>
                              <td className="px-5 py-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-ink">{acc.name}</span>
                                  {isActive && <span className="text-[9px] bg-mint text-white px-1.5 py-0.5 rounded font-medium">Active</span>}
                                </div>
                              </td>
                              <td className="px-5 py-4 font-mono text-[11px] text-body select-all">{acc.uid}</td>
                              <td className="px-5 py-4">
                                <div className="flex flex-col">
                                  <span className="text-xs text-ink">{acc.user_tag || acc.plan || 'Trial'}</span>
                                  <span className="text-[10px] text-body font-mono">Quota: {acc.quota}</span>
                                </div>
                              </td>
                              <td className="px-5 py-4">
                                {acc.is_quota_exceeded ? <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-toast-error/10 text-toast-error">Exceeded</span>
                                : acc.last_status === 'ok' ? <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-mint-soft text-mint">OK</span>
                                : <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-toast-error/10 text-toast-error" title={acc.last_error || ''}>Error</span>}
                              </td>
                              <td className="px-5 py-4 text-xs font-mono text-body">{acc.next_reset_at ? new Date(acc.next_reset_at).toLocaleDateString() : '--'}</td>
                              <td className="px-5 py-4 text-center">
                                <button onClick={() => handleToggleAccount(acc.uid, !acc.enabled)} className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative ${acc.enabled ? 'bg-ink' : 'bg-hairline-strong'}`}>
                                  <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${acc.enabled ? 'translate-x-4.5' : 'translate-x-0'}`}></div>
                                </button>
                              </td>
                              <td className="px-5 py-4 text-right">
                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => handleSelectAccount(acc.uid)} disabled={isActive || !acc.enabled} className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded-lg disabled:opacity-30 transition-colors" title="Activate"><span className="material-symbols-outlined text-[18px]">play_circle</span></button>
                                  <button onClick={() => handleDeleteAccount(acc.uid)} className="p-1.5 text-body hover:text-toast-error hover:bg-toast-error/10 rounded-lg transition-colors" title="Delete"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-hairline bg-canvas-soft">
                  <p className="text-[11px] text-body">{t.accounts.showing.replace('{count}', String(accountsConfig.accounts.length))}</p>
                </div>
              </section>
            </div>
          )}

          {/* ─── AI PLAYGROUND ─── */}
          {activeTab === 'playground' && (
            <div className="flex flex-col lg:flex-row gap-5 h-[calc(100vh-10rem)]">
              {/* Config sidebar */}
              <aside className="w-full lg:w-[280px] flex flex-col gap-4 shrink-0">
                <div className="card p-4">
                  <label className="text-xs font-medium text-body block mb-2">{t.playground.modelConfig}</label>
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full px-3 py-2 bg-canvas-soft border border-hairline rounded-lg text-sm text-ink outline-none focus:border-hairline-strong transition-colors cursor-pointer"
                  >
                    {AVAILABLE_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                  <div className="text-[10px] text-body mt-1.5 font-mono truncate">{model}</div>
                </div>

                <div className="card p-4">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-medium text-body">{t.playground.streamResponse}</span>
                    <button type="button" role="switch" aria-checked={stream} onClick={() => setStream(!stream)} className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative ${stream ? 'bg-ink' : 'bg-hairline-strong'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${stream ? 'translate-x-4.5' : 'translate-x-0'}`}></div>
                    </button>
                  </label>
                </div>

                <div className="card p-4 flex-1 flex flex-col min-h-0">
                  <label className="text-xs font-medium text-body mb-2">{t.playground.systemPrompt}</label>
                  <textarea
                    value=""
                    onChange={() => {}}
                    placeholder={t.playground.systemPromptPlaceholder}
                    className="custom-textarea flex-1 w-full p-3 bg-canvas-soft border border-hairline rounded-lg text-xs text-ink outline-none focus:border-hairline-strong transition-colors resize-none placeholder:text-body/50"
                  />
                </div>
              </aside>

              {/* Chat area */}
              <section className="flex-1 flex flex-col card overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {chatMessages.map((msg, idx) => (
                    <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'max-w-[80%] ml-auto flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-medium ${msg.role === 'user' ? 'bg-ink text-white' : 'bg-mint-soft text-mint'}`}>
                        {msg.role === 'user' ? 'U' : <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>bolt</span>}
                      </div>
                      <div className={`flex-1 min-w-0 ${msg.role === 'user' ? '' : 'space-y-3'}`}>
                        {msg.role === 'user' ? (
                          <div className="bg-ink text-white p-3 rounded-2xl rounded-tr-sm text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                        ) : msg.content === '' ? (
                          <div className="flex items-center gap-2 text-body py-1 text-xs animate-pulse">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            {t.playground.waiting}
                          </div>
                        ) : renderMessageContent(msg.content)}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSendChat} className="p-4 border-t border-hairline bg-canvas-soft">
                  <div className="flex items-end gap-2">
                    <textarea
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      placeholder={t.playground.ask}
                      rows={1}
                      className="custom-textarea flex-1 px-3.5 py-2.5 bg-white border border-hairline rounded-xl text-sm text-ink outline-none focus:border-hairline-strong transition-colors resize-none placeholder:text-body/50"
                    />
                    <button type="submit" disabled={generating || !chatInput.trim()} className="px-4 py-2.5 bg-ink text-white rounded-xl flex items-center gap-1.5 hover:bg-primary transition-colors active:scale-95 disabled:opacity-40 shrink-0 text-sm font-medium">
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
            <div className="space-y-5">
              {/* Toolbar */}
              <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-body">{t.api.desc}</p>
                <button onClick={handleGenerateKey} className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-lg hover:bg-primary transition-colors text-xs font-medium">
                  <span className="material-symbols-outlined text-[16px]">add</span>{t.api.generate}
                </button>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Gateway auth toggle */}
                <div className="card p-5 flex flex-col justify-between min-h-[160px]">
                  <div>
                    <div className="text-xs font-medium text-ink mb-1.5">{t.api.gatewayAuth}</div>
                    <p className="text-[11px] text-body leading-relaxed">{t.api.gatewayAuthDesc}</p>
                  </div>
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-hairline">
                    <span className="text-[10px] font-medium text-body uppercase tracking-wide">{t.api.systemStatus}</span>
                    <button className={`w-10 h-5.5 rounded-full p-0.5 transition-colors relative ${apiConfig.auth_required ? 'bg-ink' : 'bg-hairline-strong'}`} onClick={handleToggleAuth}>
                      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${apiConfig.auth_required ? 'translate-x-4.5' : 'translate-x-0'}`}></div>
                    </button>
                  </div>
                </div>

                {/* Active keys count */}
                <div className="card p-5 flex flex-col justify-between min-h-[160px]">
                  <div className="text-xs font-medium text-body">{t.api.activeKeys}</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-ink">{apiConfig.allowed_keys.length}</span>
                    <span className="text-[11px] text-body">{t.api.configured}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-mint">
                    <span className="w-1.5 h-1.5 rounded-full bg-mint"></span>
                    {apiConfig.auth_required ? (lang === 'zh' ? '鉴权已启用' : 'Auth enabled') : (lang === 'zh' ? '开放访问模式' : 'Open access')}
                  </div>
                </div>

                {/* Best practices hint */}
                <div className="card p-5 flex flex-col justify-between min-h-[160px]">
                  <div className="text-xs font-medium text-body mb-1">{t.api.bestPractices}</div>
                  <p className="text-[11px] text-body leading-relaxed flex-1">{t.api.bestPracticesDesc}</p>
                  <div className="flex items-center gap-1.5 text-mint-soft bg-mint text-[10px] font-medium px-2 py-1 rounded self-start">
                    <span className="material-symbols-outlined text-[12px]">shield</span>
                    {t.api.securityPolicy}
                  </div>
                </div>
              </div>

              {/* Keys table */}
              <section className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-hairline flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs font-medium text-ink">{t.api.activeAccessKeys}</span>
                  <div className="flex gap-2">
                    <input
                      value={newKey}
                      onChange={e => setNewKey(e.target.value)}
                      placeholder={t.api.keyPlaceholder}
                      className="w-56 px-3 py-1.5 bg-canvas-soft border border-hairline rounded-lg text-xs font-mono text-ink outline-none focus:border-hairline-strong transition-colors"
                    />
                    <button onClick={handleAddKey} disabled={!newKey.trim()} className="px-3.5 py-1.5 bg-ink text-white rounded-lg text-xs font-medium hover:bg-primary transition-colors disabled:opacity-40">{t.common.add}</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-hairline bg-canvas-soft">
                        <th className="px-5 py-2.5 text-[10px] font-medium text-body uppercase tracking-wide">Key</th>
                        <th className="px-5 py-2.5 text-[10px] font-medium text-body uppercase tracking-wide text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {apiConfig.allowed_keys.length === 0 ? (
                        <tr><td colSpan={2} className="py-10 text-center text-xs text-body">{t.api.noKeys}</td></tr>
                      ) : apiConfig.allowed_keys.map((key) => (
                        <tr key={key} className="hover:bg-canvas-soft transition-colors group">
                          <td className="px-5 py-3.5 font-mono text-xs text-ink select-all break-all">{key}</td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => handleCopyKey(key)} className="p-1.5 text-body hover:text-ink hover:bg-hairline rounded-lg transition-colors" title="Copy">
                                <span className="material-symbols-outlined text-[16px]">{copiedKey === key ? 'check_circle' : 'content_copy'}</span>
                              </button>
                              <button onClick={() => handleDeleteKey(key)} className="p-1.5 text-body hover:text-toast-error hover:bg-toast-error/10 rounded-lg transition-colors" title="Delete">
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
            <div className="space-y-4">
              {/* Filters */}
              <section className="relative z-40 card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-body uppercase tracking-wide block">{t.logs.account}</label>
                  <CustomSelect value={logFilterAccount} onChange={setLogFilterAccount} options={accountLogOptions.map((option, index) => index === 0 ? { ...option, label: t.logs.allAccounts } : option)} placeholder={t.logs.allAccounts} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-body uppercase tracking-wide block">{t.logs.status}</label>
                  <CustomSelect value={logFilterStatus} onChange={setLogFilterStatus} options={[{ value: 'all', label: t.logs.allStatuses }, { value: 'info', label: 'Info' }, { value: 'error', label: 'Error' }, { value: 'warning', label: 'Warning' }]} placeholder={t.logs.allStatuses} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-body uppercase tracking-wide block">{t.logs.range}</label>
                  <CustomSelect value={logFilterRange} onChange={setLogFilterRange} options={[{ value: '24h', label: t.logs.last24h }, { value: '1h', label: t.logs.lastHour }, { value: '7d', label: t.logs.last7d }]} placeholder={t.logs.last24h} />
                </div>
                <div className="flex items-end">
                  <button onClick={() => { fetchLogs(); pushToast('INFO', t.logs.noLogs, '') }} className="w-full h-11 bg-ink text-white rounded-lg flex items-center justify-center gap-1.5 hover:bg-primary transition-colors text-xs font-medium">
                    <span className="material-symbols-outlined text-[16px]">refresh</span>{t.common.refresh}
                  </button>
                </div>
              </section>

              {/* Log list */}
              <section className="card overflow-hidden">
                <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-canvas-soft border-b border-hairline">
                        {[t.logs.timestamp, t.logs.level, t.logs.message].map(h => (
                          <th key={h} className="px-5 py-2.5 text-[10px] font-medium text-body uppercase tracking-wide">{h}</th>
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
                          <tr key={i} className={`hover:bg-canvas-soft transition-colors ${isError ? 'bg-toast-error/5' : isWarn ? 'bg-peach-soft/40' : ''}`}>
                            <td className="px-5 py-2.5 font-mono text-[11px] text-body whitespace-nowrap">{log.substring(0, 10)}</td>
                            <td className="px-5 py-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                                isError ? 'bg-toast-error/10 text-toast-error'
                                : isWarn ? 'bg-peach/10 text-peach'
                                : 'bg-mint-soft text-mint'
                              }`}>
                                {level}
                              </span>
                            </td>
                            <td className="px-5 py-2.5 font-mono text-[11px] text-ink break-all">{log.replace(/^\[[\d:]+\]\s*\[\w+\]\s*/, '')}</td>
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

          {/* ─── AUTO REGISTRAR ─── */}
          {activeTab === 'register' && (
            <div className="space-y-5">
              {/* Control panel */}
              <section className="card p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-body leading-relaxed">{t.register.desc}</p>
                  <p className="text-[11px] text-body opacity-70 mt-1">{t.register.staggerHint}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-body">{t.register.countLabel}</span>
                    <div className="flex bg-canvas-soft rounded-lg p-0.5 gap-0.5">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => setRegCount(n)}
                          disabled={regStatus?.running}
                          className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${regCount === n ? 'bg-ink text-white' : 'text-body hover:bg-hairline'}`}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                  {regStatus?.running ? (
                    <button
                      onClick={stopRegister}
                      disabled={regStopping || regStatus?.stop_requested}
                      className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-medium ${regStopping || regStatus?.stop_requested ? 'bg-hairline text-body cursor-not-allowed' : 'bg-toast-error text-white hover:bg-toast-error/90'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">stop_circle</span>
                      <span>{regStopping || regStatus?.stop_requested ? t.register.stopping : t.register.stop}</span>
                    </button>
                  ) : (
                    <button
                      onClick={startRegister}
                      disabled={regStarting}
                      className={`h-9 px-4 rounded-lg flex items-center justify-center gap-1.5 transition-colors text-xs font-medium ${regStarting ? 'bg-hairline text-body cursor-not-allowed' : 'bg-ink text-white hover:bg-primary'}`}
                    >
                      <span className="material-symbols-outlined text-[16px]">person_add</span>
                      <span>{regStarting ? t.register.starting : t.register.start}</span>
                    </button>
                  )}
                </div>
              </section>

              {/* Verification banner */}
              {regStatus?.verification && regStatus?.running && (
                <div className="p-3.5 bg-peach-soft border border-peach/30 rounded-xl text-xs text-ink flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-peach animate-pulse">touch_app</span>
                  <span>{t.register.verifyHint}（{t.register.task} {regStatus.verification}）</span>
                </div>
              )}

              {/* Stats row */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-1">{t.register.statsLabel}</div>
                  <div className="text-2xl font-semibold text-ink">{regStatus?.stats?.total ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-mint uppercase tracking-wide mb-1">{t.register.success}</div>
                  <div className="text-2xl font-semibold text-mint">{regStatus?.stats?.success ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-toast-error uppercase tracking-wide mb-1">{t.register.failed}</div>
                  <div className="text-2xl font-semibold text-toast-error">{regStatus?.stats?.failed ?? 0}</div>
                </div>
                <div className="card p-4">
                  <div className="text-[10px] font-medium text-body uppercase tracking-wide mb-1">{lang === 'zh' ? '启动时间' : 'Started At'}</div>
                  <div className="text-sm font-mono text-ink mt-1.5">{regStatus?.started_at ? new Date(regStatus.started_at * 1000).toLocaleTimeString() : '—'}</div>
                </div>
              </section>

              {/* Tasks list */}
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
                        <div key={tid} className={`card overflow-hidden ${isVerify ? 'ring-2 ring-peach/40' : ''}`}>
                          <div className="px-5 py-3 border-b border-hairline flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-ink">{t.register.task} {tid}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                task.stage === 'success' ? 'bg-mint-soft text-mint'
                                : task.stage === 'failed' ? 'bg-toast-error/10 text-toast-error'
                                : task.stage === 'waiting_slider' ? 'bg-peach-soft text-peach'
                                : 'bg-canvas-soft text-body'
                              }`}>{stageText}</span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-body font-mono">
                              <span className={`w-1.5 h-1.5 rounded-full inline-block ${isActive ? (task.stage === 'success' ? 'bg-mint' : task.stage === 'failed' ? 'bg-toast-error' : 'bg-peach animate-pulse') : 'bg-hairline-strong'}`} />
                              <span>{task.started_at ? new Date(task.started_at * 1000).toLocaleTimeString() : ''}</span>
                            </div>
                          </div>
                          <div className="px-5 py-3 h-32 overflow-y-auto font-mono text-[11px] leading-relaxed text-body space-y-0.5 bg-canvas-soft">
                            {task.logs.slice().reverse().map((line, i) => (
                              <div key={i} className={`break-all ${/FAILED|ERROR/i.test(line) ? 'text-toast-error' : ''}`}>{line}</div>
                            ))}
                          </div>
                          {task.result && (
                            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs border-t border-hairline">
                              {[
                                { label: lang === 'zh' ? '邮箱' : 'Email', value: task.result.email },
                                { label: lang === 'zh' ? '密码' : 'Password', value: task.result.password },
                                { label: lang === 'zh' ? '姓名' : 'Name', value: task.result.name },
                                { label: 'Token', value: task.result.device.token },
                                { label: 'Refresh', value: task.result.device.refresh_token },
                                { label: 'UID', value: task.result.device.user_id },
                              ].map((f, i) => (
                                <div key={i} className="min-w-0">
                                  <div className="text-[10px] font-medium text-body uppercase tracking-wide">{f.label}</div>
                                  <div className="mt-0.5 font-mono text-ink break-all truncate">{f.value}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          {task.error && (
                            <div className="px-5 py-3 text-xs text-toast-error border-t border-hairline">{task.error}</div>
                          )}
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

      {/* Bottom Dock Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 px-3 py-2 bg-surface/90 backdrop-blur-md border border-hairline rounded-2xl shadow-lg">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-col items-center justify-center w-14 h-12 rounded-xl transition-all ${
                  isActive
                    ? 'bg-ink text-white'
                    : 'text-body hover:bg-canvas-soft hover:text-ink'
                }`}
                title={navLabels[item.id]}
              >
                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "" }}>
                  {item.icon}
                </span>
                <span className="text-[9px] font-medium mt-0.5 truncate max-w-full px-1">
                  {navShort[item.id]}
                </span>
              </button>
            )
          })}
        </div>
      </nav>

      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </div>
  )
}
