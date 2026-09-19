import Link from 'next/link';
import { ShieldCheck, TrendingUp, Zap } from 'lucide-react';

import { Wordmark } from '@/ui/brand/logo';

/**
 * The public shell: a calm form column on the reading-start side and a dark
 * brand panel on the other. The panel disappears entirely below `lg` so a phone
 * shows nothing but the form.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)]">
      <div className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <Link href="/">
            <Wordmark size="sm" />
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-tertiary">
          <p>© {new Date().getFullYear()} ڤيب شوب — جميع الحقوق محفوظة</p>
          <p>يمنع البيع لمن هم دون السن القانونية</p>
        </footer>
      </div>

      <aside className="relative hidden overflow-hidden bg-ink-strong lg:block">
        <div
          className="absolute inset-0 opacity-90"
          style={{
            backgroundImage:
              'radial-gradient(90% 60% at 20% 0%, rgba(52,211,153,0.18) 0%, transparent 60%), radial-gradient(70% 50% at 100% 100%, rgba(5,150,105,0.22) 0%, transparent 65%)',
          }}
          aria-hidden="true"
        />
        {/* Faint grid, the kind you see behind a financial dashboard */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to left, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden="true"
        />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div />

          <div className="max-w-md">
            <h2 className="text-[30px] font-bold leading-[1.35] text-white text-balance">
              أدر محلك بالكامل من جهاز واحد
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/65">
              مبيعات سريعة، مخزون دقيق بالجرام، ديون تحت السيطرة، وتقارير أرباح حقيقية تحسب تكلفة
              البضاعة المباعة — لا مجرد أرقام مبيعات.
            </p>

            <ul className="mt-9 space-y-4">
              {[
                {
                  icon: Zap,
                  title: 'بيع في ثوانٍ',
                  body: 'شاشة كاشير مصممة للهاتف واللابتوب، مع باركود وبيع بالوزن.',
                },
                {
                  icon: TrendingUp,
                  title: 'أرباح حقيقية',
                  body: 'حساب تكلفة البضاعة بمتوسط التكلفة المرجّح لكل عملية بيع.',
                },
                {
                  icon: ShieldCheck,
                  title: 'صلاحيات وسجل نشاط',
                  body: 'تعرف من غيّر السعر ومن ألغى الفاتورة ومتى — بالتفصيل.',
                },
              ].map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.title} className="flex gap-3.5">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-white/10 text-[var(--brand-accent)]">
                      <Icon className="size-[18px]" />
                    </span>
                    <span>
                      <span className="block text-[14px] font-bold text-white">{feature.title}</span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-white/55">
                        {feature.body}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-[12px] text-white/35">
            نظام إدارة أعمال — ليس متجراً إلكترونياً للبيع المباشر للمستهلك.
          </p>
        </div>
      </aside>
    </div>
  );
}
