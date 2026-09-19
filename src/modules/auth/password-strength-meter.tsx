'use client';

import { cn } from '@/lib/cn';
import { checkPasswordStrength } from '@/lib/password-strength';

/**
 * Four-segment strength bar plus the policy's own message. It runs the same
 * check the server validates against, so "strong" here is never rejected there.
 */
export function PasswordStrengthMeter({ password }: { password: string }) {
  if (!password) return null;
  const strength = checkPasswordStrength(password);

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3].map((index) => (
          <span
            key={index}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              index < strength.score
                ? strength.score <= 1
                  ? 'bg-danger'
                  : strength.score <= 2
                    ? 'bg-warning'
                    : 'bg-success'
                : 'bg-line',
            )}
          />
        ))}
      </div>
      <p className={cn('mt-1 text-[12px]', strength.valid ? 'text-secondary' : 'text-danger')}>
        {strength.message}
      </p>
    </div>
  );
}
