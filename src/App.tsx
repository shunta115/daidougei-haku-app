import { FestivalApp } from './festival/FestivalApp'
import { AppErrorBoundary } from './festival/components/shared/AppErrorBoundary'

export default function App() {
  return (
    <AppErrorBoundary>
      <FestivalApp />
    </AppErrorBoundary>
  )
}
