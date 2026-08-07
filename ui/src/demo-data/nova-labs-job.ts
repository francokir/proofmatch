import type { JobDetail } from '../domain/job';

/** UI-only fixture. This is fictional product-shell content, not Midnight or ledger data. */
export const novaLabsJob: JobDetail = {
  id: 'nova-ai-engineering-intern',
  company: 'Nova Labs',
  title: 'AI Engineering Intern',
  location: 'Buenos Aires',
  mode: 'Hybrid',
  employmentType: 'Internship',
  status: 'Open',
  description: 'Join Nova Labs to help prototype and build AI-powered products while working with a small engineering team in Buenos Aires.',
  responsibilities: [
    'Prototype thoughtful product experiences with a small engineering team.',
    'Help turn early AI experiments into focused, useful product surfaces.',
    'Collaborate on the practical details that make a new product feel clear and dependable.',
  ],
  suggestedCompensation: 'USD 1,000 / month',
  requiredWeeklyHours: '20 h / week',
};
