import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const NotificationContext = createContext(null)

function ConfirmDialog({ request, onResolve }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') onResolve(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onResolve])

  return (
    <div className="confirm-overlay" onMouseDown={() => onResolve(false)}>
      <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={event => event.stopPropagation()}>
        <h2 id="confirm-title">{request.title}</h2>
        <p>{request.message}</p>
        <div className="confirm-actions">
          <button className="btn-ghost" onClick={() => onResolve(false)}>{request.cancelLabel || '취소'}</button>
          <button ref={confirmRef} className={request.danger ? 'btn-danger' : 'btn-primary'} onClick={() => onResolve(true)}>
            {request.confirmLabel || '확인'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const [confirmRequest, setConfirmRequest] = useState(null)
  const nextId = useRef(1)
  const timers = useRef(new Set())
  const confirmResolver = useRef(null)

  const dismiss = useCallback(id => setToasts(items => items.filter(item => item.id !== id)), [])
  const toast = useCallback((message, options = {}) => {
    const id = nextId.current++
    const item = { id, message, tone: options.tone || 'info' }
    setToasts(items => [...items, item])
    const timer = window.setTimeout(() => {
      timers.current.delete(timer)
      dismiss(id)
    }, options.duration ?? 3500)
    timers.current.add(timer)
    return id
  }, [dismiss])

  const confirm = useCallback(options => new Promise(resolve => {
    confirmResolver.current?.(false)
    confirmResolver.current = resolve
    setConfirmRequest(options)
  }), [])

  const resolveConfirm = useCallback(result => {
    const resolve = confirmResolver.current
    confirmResolver.current = null
    setConfirmRequest(null)
    resolve?.(result)
  }, [])

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer))
    confirmResolver.current?.(false)
  }, [])

  const api = {
    toast,
    info: (message, options) => toast(message, { ...options, tone: 'info' }),
    success: (message, options) => toast(message, { ...options, tone: 'success' }),
    warning: (message, options) => toast(message, { ...options, tone: 'warning' }),
    error: (message, options) => toast(message, { ...options, tone: 'error' }),
    confirm,
  }

  return (
    <NotificationContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-label="알림" aria-live="polite">
        {toasts.map(item => (
          <div className={`toast ${item.tone}`} role={item.tone === 'error' ? 'alert' : 'status'} key={item.id}>
            <span className="toast-mark">{item.tone === 'success' ? '✓' : item.tone === 'error' ? '!' : item.tone === 'warning' ? '▲' : 'i'}</span>
            <span>{item.message}</span>
            <button aria-label="알림 닫기" onClick={() => dismiss(item.id)}>×</button>
          </div>
        ))}
      </div>
      {confirmRequest && <ConfirmDialog request={confirmRequest} onResolve={resolveConfirm} />}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider')
  return context
}
