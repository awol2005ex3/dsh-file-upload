/**
 * dsh-file-upload — Browser bundle module body.
 * Build contract (deepseek-harness packages/client/tsdown.client.ts closure
 * factory format): this file is compiled by tsc, then wrapped by
 * scripts/wrap-client.mjs with:
 *   banner: window.__ModuleLoader__.load({ id, factory: (require) => {
 *   intro : var module = { exports: {} }; var exports = module.exports;
 *   footer: return module.exports; } });
 *
 * No import/export statements (except the final module.exports assignment).
 * Types are declared locally to avoid external d.ts imports.
 *
 * Feature:
 *   - Inject one upload button into the file pane header, immediately left of
 *     the reload button (`button[data-files-reload]`)
 *   - Click opens a file picker, then POSTs selected file bytes to the plugin's
 *     own route /api/dsh-file-upload?path=…&name=… (tree root directory)
 *   - Upload failures surface as a toast
 *
 * No dsh / cordis internal APIs are used. Route contract: POST /api/dsh-file-upload
 * registered by the host half (src/index.ts); anchors in ui-sidebar-files.
 */
const PLUGIN_ID = 'dsh-file-upload'

/* ── Build guard (single mount) ── */
const GUARD_KEY = '__dshFileUploadMounted'

/* ── CJS globals injected by the wrap script ── */
declare const module: { exports: unknown }

/* ── Narrow DOM access ── */
const win = window as unknown as Record<string, unknown>
const doc = document

/** 计时器窗口面：避开 NodeNext 下全局 setTimeout 的 Node 返回类型歧义。 */
interface TimerWindow {
  setTimeout(handler: () => void, timeout: number): number
  clearTimeout(id: number | undefined): void
}
const timers = win as unknown as TimerWindow

/** 观察器构造器面：bundle 在全局作用域求值，构造函数一律从 window 取。 */
type MutationObserverCtor = new (cb: () => void) => { observe(target: Element, opts: Record<string, boolean>): void; disconnect(): void }
const MutationObserverCtor = (win as unknown as { MutationObserver?: MutationObserverCtor }).MutationObserver

/** 帧调度：优先 requestAnimationFrame，缺失环境退回短延时定时器。 */
function nextFrame(cb: () => void): void {
  const raf = (win as unknown as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame
  if (typeof raf === 'function') raf(cb)
  else timers.setTimeout(cb, 16)
}

/* ── Element anchors ── */
const RELOAD_SELECTOR = 'button[data-files-reload]'
const ROOT_SELECTOR = '[data-files-root]'
const BTN_CLASS = 'dsh-up-btn'
const STYLE_ID = PLUGIN_ID + '-style'
const TOAST_ID = PLUGIN_ID + '-toast'
const INPUT_ID = PLUGIN_ID + '-file-input'

/* ── Copy (plugin-local, no locale service) ── */
const BTN_LABEL = '上传文件'
const BUSY_LABEL = '正在上传…'
const FAILURE_TEXT: Record<string, string> = {
  notFound: '目标目录不存在或已被删除',
  denied: '没有向该目录上传文件的权限',
  tooLarge: '上传文件超过服务端大小上限',
  unavailable: '暂时无法上传文件',
}

/* 上传图标：stroke 用 currentColor，跟随头部文字色与主题。 */
const ICON_SVG =
  '<svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" ' +
  'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M10 14V4"/><path d="M6 7.5L10 3.5l4 4"/><path d="M4 16h12"/>' +
  '</svg>'

/* 全局隐藏的文件选择输入：点击头部上传按钮后弹出选择框，选中的文件上传到文件树根目录。 */
let fileInput: HTMLInputElement | null = null

function ensureFileInput(): HTMLInputElement {
  if (fileInput !== null) return fileInput
  const input = doc.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.style.display = 'none'
  input.id = INPUT_ID
  doc.body.appendChild(input)
  fileInput = input
  return input
}

/* ── 路径校验（限制为绝对路径并拒绝控制字符） ── */
function isValidPath(path: string): boolean {
  if (path.length === 0) return false
  if (path.charAt(0) !== '/' && !/^[a-zA-Z]:/.test(path)) return false
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) < 32) return false
  }
  return true
}

/* ── Toast ────────────────────────────────────────────────────────── */

function showToast(text: string): void {
  const existing = doc.getElementById(TOAST_ID)
  if (existing !== null) {
    existing.textContent = text
    existing.classList.add('show')
    timers.setTimeout(() => existing.classList.remove('show'), 3000)
    return
  }
  const toast = doc.createElement('div')
  toast.id = TOAST_ID
  toast.textContent = text
  toast.style.position = 'fixed'
  toast.style.bottom = '24px'
  toast.style.left = '50%'
  toast.style.transform = 'translateX(-50%)'
  toast.style.padding = '10px 16px'
  toast.style.borderRadius = '8px'
  toast.style.background = 'var(--dsh-toast-bg, #1f2937)'
  toast.style.color = 'var(--dsh-toast-fg, #ffffff)'
  toast.style.fontSize = '13px'
  toast.style.zIndex = '2147483647'
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)'
  toast.style.opacity = '0'
  toast.style.transition = 'opacity 0.2s ease'
  doc.body.appendChild(toast)
  void toast.offsetHeight
  toast.style.opacity = '1'
  timers.setTimeout(() => { toast.style.opacity = '0' }, 3000)
}

/* ── 样式注入 ───────────────────────────────────────────────────────── */

function installStyle(): void {
  const existing = doc.getElementById(STYLE_ID)
  if (existing !== null) return
  const style = doc.createElement('style')
  style.id = STYLE_ID
  style.textContent =
    '.dsh-up-btn { display: inline-flex; align-items: center; justify-content: center; ' +
    'width: 24px; height: 24px; padding: 0; border-radius: 5px; ' +
    'border: 1px solid transparent; background: transparent; color: inherit; ' +
    'cursor: pointer; z-index: 10; opacity: 0.75; ' +
    'flex: none; margin-right: 4px; }' +
    '.dsh-up-btn:hover { opacity: 1; background: rgba(128,128,128,0.16); }' +
    '.dsh-up-btn:focus { outline: 2px solid var(--dsh-focus, #3b82f6); outline-offset: 2px; }' +
    '.dsh-up-btn[data-busy="true"] { opacity: 0.6; cursor: wait; pointer-events: none; }' +
    '.dsh-up-btn svg { width: 16px; height: 16px; display: block; }'
  doc.head.appendChild(style)
}

/* ── 上传流程 ─────────────────────────────────────────────────────── */

function setBusy(btn: Element, busy: boolean): void {
  const btnEl = btn as HTMLElement
  if (busy) {
    btnEl.setAttribute('data-busy', 'true')
    const label = btnEl.getAttribute('aria-label') ?? BTN_LABEL
    btnEl.setAttribute('data-orig-label', label)
    btnEl.setAttribute('aria-label', BUSY_LABEL)
    btnEl.title = BUSY_LABEL
  } else {
    btnEl.removeAttribute('data-busy')
    const orig = btnEl.getAttribute('data-orig-label')
    if (orig !== null) {
      btnEl.setAttribute('aria-label', orig)
      btnEl.title = orig
      btnEl.removeAttribute('data-orig-label')
    } else {
      btnEl.setAttribute('aria-label', BTN_LABEL)
      btnEl.title = BTN_LABEL
    }
  }
}

function classifyFailure(status: number): 'notFound' | 'denied' | 'tooLarge' | 'unavailable' {
  switch (status) {
    case 403: case 401: return 'denied'
    case 404: return 'notFound'
    case 413: return 'tooLarge'
    default: return 'unavailable' as 'unavailable'
  }
}

/** 上传选中的文件到指定目录（文件树当前根目录）。 */
function uploadFiles(path: string, btn: Element): void {
  if (!isValidPath(path)) {
    showToast('无法获取目标目录路径')
    return
  }

  const input = ensureFileInput()
  input.value = ''
  input.onchange = () => {
    const files = input.files!
    if (files.length === 0) return
    setBusy(btn, true)
    let idx = 0
    function next(): void {
      if (idx >= files.length) {
        setBusy(btn, false)
        showToast('上传完成')
        return
      }
      const file = files.item(idx)
      if (file === null) return
      idx++
      doUpload(path, file, btn, next)
    }
    next()
  }
  input.click()
}

function doUpload(path: string, file: File, btn: Element, onDone: () => void): void {
  // 官方 /api/file 只有 GET/HEAD，上传走插件自己注册的 POST 路由。
  const url = '/api/dsh-file-upload?path=' + encodeURIComponent(path) + '&name=' + encodeURIComponent(file.name)

  fetch(url, {
    method: 'POST',
    body: file,
    credentials: 'same-origin',
  })
    .then((response) => {
      if (response.ok) {
        // 成功，继续下一个
      } else {
        const reason = classifyFailure(response.status)
        const msg = FAILURE_TEXT[reason] ?? FAILURE_TEXT.unavailable
        showToast(msg!)
        console.debug('[dsh-file-upload] refused:', reason, response.status, path!, file.name)
      }
    })
    .catch(() => {
      showToast('上传失败：无法连接到服务端')
      console.debug('[dsh-file-upload] upload failed (network):', path, file.name)
    })
    .finally(() => {
      timers.setTimeout(onDone, 0)
    })
}

/* ── Header decoration + observation ──────────────────────────────── */

/** 读取文件树当前根目录（data-files-root 所在容器的属性）。 */
function currentRoot(): string | null {
  const rootEl = doc.querySelector(ROOT_SELECTOR)
  if (rootEl === null) return null
  return rootEl.getAttribute('data-files-root')
}

/** 在刷新按钮左侧放一个上传按钮（红框位），只挂一次。 */
function decorateHeader(): void {
  if (doc.querySelector('.' + BTN_CLASS) !== null) return
  const reload = doc.querySelector(RELOAD_SELECTOR)
  if (reload === null) return
  const parent = reload.parentElement
  if (parent === null) return
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = BTN_CLASS
  btn.setAttribute('aria-label', BTN_LABEL)
  btn.title = BTN_LABEL
  btn.innerHTML = ICON_SVG
  btn.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const path = currentRoot()
    if (path === null) {
      showToast('无法获取目标目录路径')
      return
    }
    uploadFiles(path, btn)
  })
  parent.insertBefore(btn, reload)
}

let scheduled = false
/** 连续变更批次计数：若页面持续高频重排，停用观察器止损。 */
let mutationBatches = 0

function scheduleDecorate(): void {
  if (scheduled) return
  scheduled = true
  nextFrame(() => {
    scheduled = false
    decorateHeader()
  })
}

function init(): void {
  installStyle()
  decorateHeader()
  const body = doc.body
  if (body !== null && MutationObserverCtor !== undefined) {
    let timer: number | undefined
    const observer = new MutationObserverCtor(() => {
      mutationBatches++
      if (mutationBatches > 300 && timer === undefined) {
        console.warn('[dsh-file-upload] change storm detected — observer stopped; existing buttons remain')
        observer.disconnect()
        timer = timers.setTimeout(() => { timer = undefined }, 5000)
      }
      scheduleDecorate()
    })
    observer.observe(body, { childList: true, subtree: true })
  }
  console.log('[dsh-file-upload] plugin loaded, watching the file tree')
}

/* ── Client plugin contract ── */

function apply(_ctx: unknown): void {
  if (win[GUARD_KEY] === true) return
  win[GUARD_KEY] = true
  try {
    init()
  } catch (err) {
    win.__dshFileUploadError = String(err)
  }
}

module.exports = { name: PLUGIN_ID, apply }


