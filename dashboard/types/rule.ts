export interface Rule {
  id?: number
  deviceId: string
  metricName: string
  minValue: number
  maxValue: number
  packetThreshold: number
  severity: string
  enabled: boolean
}