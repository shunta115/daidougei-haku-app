import { RefreshCw } from 'lucide-react'

export function RefreshButton() {
  return (
    <button
      type="button"
      className="pl-refresh-button"
      onClick={() => window.location.reload()}
      aria-label="最新情報に更新"
      title="更新"
    >
      <RefreshCw size={16} aria-hidden="true" />
      <span>更新</span>
    </button>
  )
}
