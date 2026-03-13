const statusStyles: Record<string, { bg: string; text: string }> = {
  new: { bg: '#dbeafe', text: '#1e40af' },
  reviewing: { bg: '#fef3c7', text: '#92400e' },
  pursuing: { bg: '#d1fae5', text: '#065f46' },
  passed: { bg: '#f3f4f6', text: '#6b7280' },
  submitted: { bg: '#ede9fe', text: '#5b21b6' },
  low: { bg: '#f3f4f6', text: '#6b7280' },
  medium: { bg: '#fef3c7', text: '#92400e' },
  high: { bg: '#fee2e2', text: '#991b1b' },
  critical: { bg: '#fecaca', text: '#dc2626' },
  revenue: { bg: '#d1fae5', text: '#065f46' },
  pivot: { bg: '#fef3c7', text: '#92400e' },
  thought_leadership: { bg: '#dbeafe', text: '#1e40af' },
  framework: { bg: '#ede9fe', text: '#5b21b6' },
  offering: { bg: '#fce7f3', text: '#9d174d' },
};

interface StatusBadgeProps {
  status: string;
  label?: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const style = statusStyles[status] || { bg: '#f3f4f6', text: '#6b7280' };
  const displayLabel = label || status.replace(/_/g, ' ');

  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {displayLabel}
    </span>
  );
}
