import React from 'react';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  className?: string;
  accentTop?: 'team-a' | 'team-b' | 'brand' | 'none';
  hoverable?: boolean;
}

export function Panel({
  children,
  className = '',
  accentTop = 'none',
  hoverable = false,
  ...props
}: PanelProps) {
  let borderTopStyle = '';
  if (accentTop === 'team-a') borderTopStyle = 'border-t-4 border-t-rose-500';
  else if (accentTop === 'team-b') borderTopStyle = 'border-t-4 border-t-blue-500';
  else if (accentTop === 'brand') borderTopStyle = 'border-t-4 border-t-emerald-500';

  const hoverStyle = hoverable ? 'hover:shadow-md hover:border-slate-300 transition-all duration-200' : '';

  return (
    <div
      className={`rounded-xl bg-white border border-slate-200/80 shadow-sm ${borderTopStyle} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
