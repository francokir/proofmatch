export interface JobDetail {
  id: string;
  company: string;
  title: string;
  location: string;
  mode: string;
  employmentType: string;
  status: 'Open';
  description: string;
  responsibilities: string[];
  suggestedCompensation: string;
  requiredWeeklyHours: string;
}
