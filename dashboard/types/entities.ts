export type RuleSeverity = "LOW" | "MEDIUM" | "HIGH"

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
}

export interface AlertRow {
  id: number
  device_id: string
  metric_name: string
  current_value?: number
  severity?: RuleSeverity
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED"
  triggered_at?: string
}
