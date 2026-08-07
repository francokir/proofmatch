/** DEMO DATA — NOT FROM MIDNIGHT OR A LEDGER. Contains no candidate private terms. */
import type { RecruiterDashboardData } from '../domain/recruiter';

export const recruiterDashboardDemo: RecruiterDashboardData = {
  matchCount: 3,
  requiredAvailability: '20 h / week',
  suggestedCompensation: 'USD 1,000 / month',
  matches: [
    { reference: 'A7F2', compensationCompatible: true, availabilityCompatible: true, uniqueForJob: true },
    { reference: 'B3C9', compensationCompatible: true, availabilityCompatible: true, uniqueForJob: true },
    { reference: 'D91E', compensationCompatible: true, availabilityCompatible: true, uniqueForJob: true },
  ],
};
