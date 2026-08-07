export interface CandidatePrivateTerms { minimumCompensation: number; availableWeeklyHours: number; }
export interface PrivateMatchWizardProps { initialValues?: CandidatePrivateTerms; onBack: () => void; onStartPrivateCheck: (terms: CandidatePrivateTerms) => void; }

export type ProofFlowStatus = 'preparing' | 'generating-proof' | 'awaiting-wallet' | 'submitting' | 'indexing' | 'confirmed' | 'failed';
export type ProofProgressStatus = 'idle' | 'proof_generating' | 'signature_pending' | 'transaction_pending' | 'indexing_pending' | 'confirmed' | 'failed';
export type ProofStepState = 'pending' | 'active' | 'completed' | 'failed';
export interface ProofFlowStep { id: Exclude<ProofFlowStatus, 'confirmed' | 'failed'>; label: string; description: string; status: ProofStepState; }
export interface ProofProgressProps { status?: ProofProgressStatus; error?: ProofFlowError; onRetry: () => void; onCancel: () => void; onComplete: () => void; onReset?: () => void; }
export type ProofFlowError = 'proof-generation' | 'wallet-unavailable' | 'wallet-declined' | 'submission' | 'confirmation-delayed';
export interface MatchPassData { jobId: string; company: string; title: string; location: string; status: 'demo-success'; reference: string; checks: string[]; privacyItems: string[]; }
export interface MatchPassProps { data: MatchPassData; onBackToJob: () => void; onRecruiterView: () => void; onLedgerView: () => void; }
