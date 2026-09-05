import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
}

const SAVE_KEYS = ['steel-assault-profiles-v1', 'steel-assault-progress-v1', 'steel-assault-setup-v1'];

export function resetSaves() {
  try {
    for (const k of SAVE_KEYS) localStorage.removeItem(k);
  } catch {
    /* */
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ui] render failed', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div className="w-full h-full flex items-center justify-center bg-olive-950 text-olive-200 p-6 overflow-auto">
        <div className="panel p-8 w-[560px] text-center">
          <div className="panel-title">Сбой интерфейса</div>
          <div className="text-2xl font-bold mt-2">Что-то пошло не так</div>
          <div className="mono text-[11px] text-olive-300 mt-3 break-words text-left bg-olive-900/60 border border-olive-500/30 p-3 max-h-[160px] overflow-auto">
            {String(e.message || e)}
          </div>
          <div className="mono text-[11px] text-olive-400 mt-2 text-left">
            Чаще всего помогает сброс локальных сохранений (битый сейв в localStorage).
          </div>
          <div className="flex gap-2 mt-5 justify-center">
            <button
              className="chip"
              onClick={() => {
                resetSaves();
                window.location.reload();
              }}
            >
              Сбросить сохранения и перезагрузить
            </button>
            <button className="chip" onClick={() => window.location.reload()}>
              Просто перезагрузить
            </button>
          </div>
        </div>
      </div>
    );
  }
}
