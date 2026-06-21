import './admin-shared.css';

interface AdminFlashProps {
  error?: string | null;
  success?: string | null;
}

export function AdminFlash({ error, success }: AdminFlashProps) {
  return (
    <>
      {error && <p class="admin-flash admin-flash--error">{error}</p>}
      {success && <p class="admin-flash admin-flash--success">{success}</p>}
    </>
  );
}
