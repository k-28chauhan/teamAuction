import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'flood' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'secondary',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    'inline-flex items-center justify-center rounded-lg font-sans text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-emerald-600 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-base font-semibold gap-2.5',
  };

  const isPrimary = variant === 'primary' || variant === 'flood';

  let variantStyle = 'bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 hover:text-slate-900';
  if (isPrimary) {
    variantStyle = 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm shadow-emerald-600/20';
  } else if (variant === 'outline') {
    variantStyle = 'bg-transparent text-slate-700 border border-slate-300 hover:bg-slate-50';
  } else if (variant === 'danger') {
    variantStyle = 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100';
  } else if (variant === 'ghost') {
    variantStyle = 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70';
  }

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyle} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="inline-flex items-center gap-2">
          <svg className="animate-spin h-4 w-4 text-current" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>{children}</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
