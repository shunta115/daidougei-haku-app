import { useEffect, useRef } from 'react'
type RefreshTask = () => unknown | Promise<unknown>
const tasks = new Set<() => Promise<void>>()
export function useRefreshTask(task: RefreshTask) { const latest = useRef(task); latest.current = task; useEffect(() => { const run = async () => { await latest.current() }; tasks.add(run); return () => { tasks.delete(run) } }, []) }
export async function refreshVisibleData() { await Promise.allSettled([...tasks].map((task) => task())) }
