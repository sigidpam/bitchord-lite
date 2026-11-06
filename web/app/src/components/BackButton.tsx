import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

const button =
  'grid size-8 place-items-center rounded-full text-secondary transition-colors duration-100 ease-in enabled:hover:bg-quinary enabled:hover:text-primary disabled:opacity-25';

/**
 * Back to the previous page. History depth comes from the router's own
 * browser-history index, so a page opened directly (or the app at launch) has
 * nothing to go back to. Home is the root and stays disabled.
 */
export function BackButton({ className = '' }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
  const disabled = index <= 0 || pathname === '/home' || pathname === '/';
  return (
    <button
      type="button"
      className={`${button} ${className}`}
      aria-label="Back"
      title="Back"
      disabled={disabled}
      onClick={() => navigate(-1)}
    >
      <ArrowLeft size={18} strokeWidth={2.2} />
    </button>
  );
}
