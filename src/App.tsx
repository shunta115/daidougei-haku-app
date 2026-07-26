import { PlatformApp } from './platform/PlatformApp'
import { AppErrorBoundary } from './festival/components/shared/AppErrorBoundary'

export default function App() {
  return (
    <AppErrorBoundary>
      <PlatformApp />
    </AppErrorBoundary>
  )
}
