export type RuleSeverity = "LOW" | "MEDIUM" | "HIGH"
export type TriggerMode = "PACKET_ONLY" | "DURATION_ONLY" | "BOTH"

export interface RuleRow {
  id: number
  device_id: string
  metric_name: string
  min_value: number
  max_value: number
  packet_threshold: number
  duration_minutes: number
  severity: RuleSeverity
  enabled: boolean
  trigger_mode: TriggerMode
}

export interface AlertRow {
  id: number
  device_id: string
  metric_name: string
  current_value?: number
  severity?: RuleSeverity
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
  triggered_at?: string
  current_level?: number
}
