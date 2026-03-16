interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'var(--border)' }}
      >
        <span className="text-2xl" style={{ color: 'var(--text-muted)' }}>{'\u25C7'}</span>
      </div>
      <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--navy)' }}>{title}</h3>
      {description && (
        <p className="text-sm max-w-md" style={{ color: 'var(--text-muted)' }}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
