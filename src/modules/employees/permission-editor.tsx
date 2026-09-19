'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Lock, Search, ShieldAlert } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PERMISSION_GROUPS } from '@/core/rbac/permissions';
import { NavIcon } from '@/modules/shell/nav-icon';
import { Input } from '@/ui/primitives/input';

/**
 * Permission picker.
 *
 * Grouped by area and collapsible, because a flat list of sixty checkboxes is
 * unusable. Sensitive permissions — the ones that move money or rewrite history
 * — are marked, so an owner granting them does so on purpose.
 */
export function PermissionEditor({
  selected,
  onChange,
  /** Permissions the current user cannot grant because they lack them. */
  grantable,
  /** Shows which permissions come from the role, when editing a person. */
  inherited,
  disabled = false,
}: {
  selected: string[];
  onChange: (permissions: string[]) => void;
  grantable?: Set<string>;
  inherited?: Set<string>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (permission: string) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    onChange([...next]);
  };

  const toggleGroup = (permissions: string[], allSelected: boolean) => {
    if (disabled) return;
    const next = new Set(selectedSet);
    for (const permission of permissions) {
      if (grantable && !grantable.has(permission)) continue;
      if (allSelected) next.delete(permission);
      else next.add(permission);
    }
    onChange([...next]);
  };

  const term = query.trim();
  const groups = PERMISSION_GROUPS.map((group) => ({
    ...group,
    permissions: term
      ? group.permissions.filter(
          (permission) =>
            permission.label.includes(term) ||
            permission.description.includes(term) ||
            group.label.includes(term),
        )
      : group.permissions,
  })).filter((group) => group.permissions.length > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن صلاحية…"
          iconStart={<Search className="size-4" />}
          className="min-w-0 flex-1 sm:max-w-xs"
        />
        <span className="num-mixed text-[12.5px] text-secondary">
          {selectedSet.size} صلاحية مفعّلة
        </span>
      </div>

      <div className="space-y-2">
        {groups.map((group) => {
          const groupKeys = group.permissions.map((permission) => permission.key);
          const allowedKeys = grantable
            ? groupKeys.filter((key) => grantable.has(key))
            : groupKeys;
          const activeCount = groupKeys.filter((key) => selectedSet.has(key)).length;
          const allSelected = allowedKeys.length > 0 && allowedKeys.every((key) => selectedSet.has(key));
          const isCollapsed = collapsed.has(group.key) && !term;

          return (
            <div
              key={group.key}
              className="overflow-hidden rounded-[var(--radius-md)] border border-line-subtle bg-card"
            >
              <div className="flex items-center gap-2 bg-sunken/50 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((current) => {
                      const next = new Set(current);
                      if (next.has(group.key)) next.delete(group.key);
                      else next.add(group.key);
                      return next;
                    })
                  }
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-start"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-card text-secondary">
                    <NavIcon name={group.icon} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-bold text-primary">
                      {group.label}
                    </span>
                    <span className="num-mixed block text-[11.5px] text-tertiary">
                      {activeCount} من {groupKeys.length}
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-4 shrink-0 text-tertiary transition-transform',
                      isCollapsed && 'rotate-180',
                    )}
                  />
                </button>

                {!disabled && allowedKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupKeys, allSelected)}
                    className="shrink-0 rounded-[var(--radius-xs)] px-2 py-1 text-[11.5px] font-bold text-accent-strong transition-colors hover:bg-accent-soft"
                  >
                    {allSelected ? 'إلغاء الكل' : 'تحديد الكل'}
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <ul className="divide-y divide-line-subtle">
                  {group.permissions.map((permission) => {
                    const checked = selectedSet.has(permission.key);
                    const locked = grantable ? !grantable.has(permission.key) : false;
                    const fromRole = inherited?.has(permission.key) ?? false;
                    // `sensitive` is only present on the entries that set it,
                    // so narrow rather than assuming the widened shape.
                    const sensitive = 'sensitive' in permission && permission.sensitive === true;

                    return (
                      <li key={permission.key}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors',
                            locked || disabled ? 'cursor-not-allowed opacity-60' : 'hover:bg-sunken/40',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={locked || disabled}
                            onChange={() => toggle(permission.key)}
                            className="mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-card transition-colors checked:border-accent-strong checked:bg-accent-strong disabled:cursor-not-allowed"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13px] font-medium text-primary">
                                {permission.label}
                              </span>
                              {sensitive && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-1.5 py-0.5 text-[10.5px] font-bold text-warning">
                                  <ShieldAlert className="size-3" />
                                  حساسة
                                </span>
                              )}
                              {fromRole && (
                                <span className="rounded-full bg-sunken px-1.5 py-0.5 text-[10.5px] text-tertiary">
                                  من الدور
                                </span>
                              )}
                              {locked && (
                                <span className="inline-flex items-center gap-1 text-[10.5px] text-tertiary">
                                  <Lock className="size-3" />
                                  لا تملكها
                                </span>
                              )}
                            </span>
                            {permission.description && (
                              <span className="mt-0.5 block text-[11.5px] leading-relaxed text-tertiary">
                                {permission.description}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {groups.length === 0 && (
        <p className="py-8 text-center text-[13px] text-tertiary">لا توجد صلاحيات مطابقة للبحث.</p>
      )}
    </div>
  );
}

/**
 * Per-person overrides on top of a role: extra grants and explicit denials.
 * Kept visually separate from the role's own permissions so it stays obvious
 * that this person differs from everyone else holding the same role.
 */
export function PermissionOverrides({
  rolePermissions,
  extra,
  denied,
  onExtraChange,
  onDeniedChange,
  grantable,
}: {
  rolePermissions: string[];
  extra: string[];
  denied: string[];
  onExtraChange: (permissions: string[]) => void;
  onDeniedChange: (permissions: string[]) => void;
  grantable?: Set<string>;
}) {
  const roleSet = useMemo(() => new Set(rolePermissions), [rolePermissions]);
  const [mode, setMode] = useState<'extra' | 'denied'>('extra');

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
        {(
          [
            { value: 'extra' as const, label: `صلاحيات إضافية (${extra.length})` },
            { value: 'denied' as const, label: `صلاحيات ممنوعة (${denied.length})` },
          ]
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setMode(option.value)}
            className={cn(
              'h-9 rounded-[var(--radius-xs)] px-3 text-[12.5px] font-semibold transition-all',
              mode === option.value ? 'bg-card text-primary shadow-xs' : 'text-secondary',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <p className="text-[12.5px] leading-relaxed text-secondary">
        {mode === 'extra'
          ? 'صلاحيات تُمنح لهذا الموظف تحديداً فوق ما يمنحه دوره.'
          : 'صلاحيات تُسحب من هذا الموظف حتى لو كان دوره يمنحها — المنع يغلب المنح دائماً.'}
      </p>

      <PermissionEditor
        selected={mode === 'extra' ? extra : denied}
        onChange={mode === 'extra' ? onExtraChange : onDeniedChange}
        grantable={mode === 'extra' ? grantable : undefined}
        inherited={roleSet}
      />
    </div>
  );
}
