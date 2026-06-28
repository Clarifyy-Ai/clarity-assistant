export type QaPriority = "P0" | "P1" | "P2" | "P3";

export type QaStatus =
  | "Not Tested"
  | "Pass"
  | "Fail"
  | "Blocked"
  | "N/A"
  | "Implemented";

export interface QaChecklistItem {
  id: string;
  part: string;
  section: string;
  subsection: string;
  test: string;
  priority: QaPriority;
  status: QaStatus;
}

export type QaStatusMap = Record<string, QaStatus>;
