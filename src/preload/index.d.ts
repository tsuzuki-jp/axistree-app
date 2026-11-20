import type { AxisTreeApi } from '../shared/ipc'

declare global {
  interface Window {
    axistree: AxisTreeApi
  }
}

export {}
