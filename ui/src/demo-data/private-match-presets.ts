import type { CandidatePrivateTerms } from '../domain/private-match';
export interface PrivateMatchDemoPreset extends CandidatePrivateTerms { id: 'compatible' | 'salary-mismatch' | 'availability-mismatch'; label: string; }
/** UI-only demo shortcuts. They populate local form state and never run a match. */
export const privateMatchDemoPresets: PrivateMatchDemoPreset[] = [
  { id: 'compatible', label: 'Compatible', minimumCompensation: 1200, availableWeeklyHours: 24 },
  { id: 'salary-mismatch', label: 'Salary mismatch', minimumCompensation: 1800, availableWeeklyHours: 24 },
  { id: 'availability-mismatch', label: 'Availability mismatch', minimumCompensation: 1200, availableWeeklyHours: 12 },
];
