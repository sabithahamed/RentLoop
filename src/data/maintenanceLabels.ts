/** Display vocabulary for maintenance. Kept out of the screens so the words stay consistent. */

import type { MaintenanceCategory, MaintenanceStatus, MaintenanceUrgency } from "./lifecycleTypes";

type Tone = "neutral" | "good" | "warn" | "bad" | "info";

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  reported: "Reported",
  acknowledged: "Seen by landlord",
  approved: "Approved",
  in_progress: "Work underway",
  resolved: "Resolved",
  declined: "Declined",
};

export const MAINTENANCE_STATUS_TONE: Record<MaintenanceStatus, Tone> = {
  reported: "warn",
  acknowledged: "info",
  approved: "info",
  in_progress: "info",
  resolved: "good",
  declined: "bad",
};

/** What the landlord can move a ticket to from where it is now. */
export const NEXT_STATUSES: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  reported: ["acknowledged", "approved", "declined"],
  acknowledged: ["approved", "declined"],
  approved: ["in_progress", "declined"],
  in_progress: ["resolved"],
  resolved: [],
  declined: [],
};

export const URGENCY_LABEL: Record<MaintenanceUrgency, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  emergency: "Emergency",
};

export const URGENCY_TONE: Record<MaintenanceUrgency, Tone> = {
  low: "neutral",
  normal: "neutral",
  high: "warn",
  emergency: "bad",
};

export const URGENCIES: readonly MaintenanceUrgency[] = ["low", "normal", "high", "emergency"];

export const CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  plumbing: "Plumbing",
  electrical: "Electrical",
  structural: "Structural",
  appliance: "Appliance",
  pest: "Pests",
  other: "Other",
};

export const CATEGORIES: readonly MaintenanceCategory[] = [
  "plumbing",
  "electrical",
  "structural",
  "appliance",
  "pest",
  "other",
];
