import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

let _nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message, options = {}) => {
    const id = _nextId++;
    const duration = options.duration ?? 3500;

    setToasts(prev => {
      const next = [{ id, type, message, duration }, ...prev];
      return next.slice(0, 3); // max 3, LIFO — newest first
    });

    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((message, options) => addToast('success', message, options), [addToast]);
  const error   = useCallback((message, options) => addToast('error',   message, options), [addToast]);
  const warning = useCallback((message, options) => addToast('warning', message, options), [addToast]);
  const info    = useCallback((message, options) => addToast('info',    message, options), [addToast]);

  return (
    <ToastContext.Provider value={{ toasts, success, error, warning, info, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  const { success, error, warning, info, dismiss } = ctx;
  return { success, error, warning, info, dismiss };
}

export function useToastState() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToastState must be used within a ToastProvider');
  return ctx;
}
