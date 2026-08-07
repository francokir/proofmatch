import type { ReactNode } from 'react';

interface PillButtonProps {
  children: ReactNode;
  onClick: () => void;
}

export function PillButton({ children, onClick }: PillButtonProps) {
  return <button className="pill-button" type="button" onClick={onClick}>{children}</button>;
}
