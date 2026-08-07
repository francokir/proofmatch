export interface RecruiterMatch {
  reference: string;
  compensationCompatible: boolean;
  availabilityCompatible: boolean;
  uniqueForJob: boolean;
}

export interface RecruiterDashboardData {
  matchCount: number;
  requiredAvailability: string;
  suggestedCompensation: string;
  matches: RecruiterMatch[];
}
