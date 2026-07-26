import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/** 予期せぬエラーでも真っ白にせず来場者向け案内を出す */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* スタックは利用者に出さない */
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fe-error-fallback" role="alert">
          <p className="fe-error-fallback__k" lang="en">
            TEMPORARY ISSUE
          </p>
          <h1 className="fe-error-fallback__title">表示を復旧できませんでした</h1>
          <p className="fe-error-fallback__body">ページを再読み込みしてください。問題が続く場合はしばらくお待ちください。</p>
          <button type="button" className="fe-btn fe-btn--primary" onClick={() => window.location.assign('/')}>
            ホームへ戻る
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
