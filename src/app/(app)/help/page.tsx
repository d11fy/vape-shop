import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  HandCoins,
  Keyboard,
  LifeBuoy,
  Mail,
  Phone,
  Receipt,
  Scale,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  BarChart3,
} from 'lucide-react';

import { can, requireStore } from '@/core/auth/context';
import { env } from '@/core/env';
import type { Permission } from '@/core/rbac/permissions';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'المساعدة' };

interface Guide {
  title: string;
  href: string;
  icon: typeof BookOpen;
  permission: Permission;
  steps: string[];
}

/**
 * Task guides, shown only to members who can actually do the task — a cashier
 * is not walked through managing staff. Every step describes what the system
 * really does, so this page doubles as a plain-language spec.
 */
const GUIDES: Guide[] = [
  {
    title: 'تسجيل عملية بيع',
    href: '/pos',
    icon: ShoppingCart,
    permission: 'sales.create',
    steps: [
      'افتح شاشة البيع وابحث عن المنتج بالاسم أو امسح الباركود.',
      'اضغط على السطر في السلة لتعديل الكمية أو السعر أو الخصم حسب صلاحياتك.',
      'للبيع الآجل اختر العميل أولاً — يُرفض البيع إذا تجاوز حد الدين المسموح.',
      'اضغط «الدفع» واختر طريقة الدفع، ويمكن تقسيم المبلغ على أكثر من طريقة.',
      'بعد الحفظ يُخصم المخزون وتُحتسب تكلفة البضاعة فوراً، ويمكنك طباعة الإيصال.',
    ],
  },
  {
    title: 'البيع بالوزن (المعسل)',
    href: '/products/new',
    icon: Scale,
    permission: 'products.create',
    steps: [
      'عند إضافة المنتج اختر طريقة البيع «بالوزن» ووحدة البيع: 50 جرام، 250 جرام، كيلو…',
      'يُحفظ المخزون بالجرام، فتبيع علبة كاملة أو كمية جزئية من نفس الرصيد.',
      'في شاشة البيع أدخل الكمية بالكسور، مثل 0.5 كيلو.',
    ],
  },
  {
    title: 'تحصيل دين من عميل',
    href: '/debts',
    icon: HandCoins,
    permission: 'debts.collect',
    steps: [
      'افتح صفحة الديون واضغط «تحصيل» بجانب العميل.',
      'أدخل المبلغ وطريقة الدفع — يُوزَّع على الفواتير الأقدم أولاً.',
      'يظهر التحصيل في كشف حساب العميل وفي الصندوق، وتُطبع له سند قبض.',
    ],
  },
  {
    title: 'إغلاق الوردية',
    href: '/cashbox/shifts',
    icon: Wallet,
    permission: 'shifts.close',
    steps: [
      'عدّ النقد الموجود في الدرج فعلياً وأدخل المبلغ.',
      'يحسب النظام المتوقع: رصيد الافتتاح + المبيعات النقدية + التحصيلات − المصاريف والمرتجعات.',
      'إذا وُجد فرق يجب ذكر سببه؛ يُسجل الفرق في الصندوق ويصل تنبيه لصاحب المحل.',
    ],
  },
  {
    title: 'استلام بضاعة من مورد',
    href: '/purchases/new',
    icon: Truck,
    permission: 'purchases.create',
    steps: [
      'أنشئ فاتورة شراء واختر المورد والمنتجات والكميات وأسعار الشراء.',
      'مصاريف الشحن والجمارك تُوزع على تكلفة الأصناف.',
      'عند الاستلام يزيد المخزون ويُحدَّث متوسط التكلفة المرجّح لكل صنف.',
    ],
  },
  {
    title: 'الجرد وتسوية المخزون',
    href: '/inventory/count',
    icon: ClipboardCheck,
    permission: 'inventory.adjust',
    steps: [
      'افتح صفحة الجرد وأدخل الكمية الفعلية لكل صنف قمت بعدّه.',
      'يعرض النظام الفرق عن الرصيد المسجل قبل التأكيد.',
      'عند الحفظ تُسجل تسوية بالفروقات وتكلفتها في سجل النشاط باسمك.',
    ],
  },
  {
    title: 'إضافة موظف وتحديد صلاحياته',
    href: '/employees',
    icon: Users,
    permission: 'employees.manage',
    steps: [
      'أضف الموظف واختر دوره: مدير، كاشير، محاسب، مسؤول مخزون، أو دور مخصص.',
      'يحصل على كلمة مرور مؤقتة تُعرض مرة واحدة، ويُلزم بتغييرها عند أول دخول.',
      'يمكنك منح صلاحية إضافية أو حجب صلاحية لموظف بعينه دون تغيير دوره.',
    ],
  },
  {
    title: 'قراءة التقارير والأرباح',
    href: '/reports',
    icon: BarChart3,
    permission: 'reports.view',
    steps: [
      'اختر الفترة من أعلى التقرير: اليوم، الأسبوع، الشهر، أو فترة مخصصة.',
      'تقرير الأرباح يعرض صافي الربح بعد تكلفة البضاعة والمصاريف، لا المبيعات فقط.',
      'يمكن تصدير أي تقرير إلى Excel أو CSV.',
    ],
  },
];

const SHORTCUTS: Array<{ keys: string[]; label: string; where: string }> = [
  { keys: ['Ctrl', 'K'], label: 'البحث السريع عن منتج أو فاتورة أو عميل', where: 'في كل الصفحات' },
  { keys: ['F4'], label: 'الانتقال إلى حقل البحث', where: 'شاشة البيع' },
  { keys: ['F8'], label: 'فتح نافذة الدفع', where: 'شاشة البيع' },
  { keys: ['F2'], label: 'بدء عملية بيع جديدة وتفريغ السلة', where: 'شاشة البيع' },
  { keys: ['Enter'], label: 'إضافة المنتج بعد مسح الباركود', where: 'شاشة البيع' },
];

const FAQ: Array<{ question: string; answer: string }> = [
  {
    question: 'لماذا يختلف الربح عن إجمالي المبيعات؟',
    answer:
      'المبيعات هي ما دفعه العملاء. الربح = الإيرادات بعد استبعاد الضريبة، ناقص تكلفة البضاعة المباعة، ناقص المصاريف. تكلفة كل صنف تُحسب لحظة البيع بمتوسط التكلفة المرجّح، لذلك يبقى ربح الفواتير القديمة صحيحاً حتى لو تغيرت أسعار الشراء لاحقاً.',
  },
  {
    question: 'ما هو متوسط التكلفة المرجّح؟',
    answer:
      'عند شراء كمية جديدة بسعر مختلف، يدمج النظام تكلفة الرصيد الحالي مع تكلفة الكمية الجديدة حسب الكميات. مثال: 10 علب بتكلفة 20 و10 علب بتكلفة 24 تصبح 20 علبة بمتوسط 22.',
  },
  {
    question: 'هل يمكن حذف فاتورة؟',
    answer:
      'لا تُحذف أي عملية مالية نهائياً. يمكن إلغاء الفاتورة لمن يملك الصلاحية فيُعاد المخزون والمبلغ، أو عمل مرتجع كامل أو جزئي. في الحالتين تبقى الفاتورة الأصلية ظاهرة ويُسجل الإجراء في سجل النشاط.',
  },
  {
    question: 'لماذا لا أستطيع تغيير العملة؟',
    answer:
      'كل المبالغ محفوظة بعملة المتجر. بعد تسجيل أي عملية مالية تُقفل العملة حتى لا تتغير قيم الفواتير والحسابات القديمة.',
  },
  {
    question: 'ماذا يحدث عند انتهاء الاشتراك؟',
    answer:
      'تبدأ فترة سماح يمكنك خلالها عرض بياناتك دون تسجيل عمليات جديدة، ثم يتوقف الوصول حتى التجديد. بياناتك لا تُحذف وتعود كاملة بمجرد التجديد.',
  },
  {
    question: 'رأيت جهازاً لا أعرفه في حسابي، ماذا أفعل؟',
    answer:
      'من صفحة «حسابي» أنهِ الجلسة غير المعروفة أو اضغط «الخروج من الكل»، ثم غيّر كلمة المرور.',
  },
  {
    question: 'التحقق من العمر عند البيع',
    answer:
      'إذا فعّل صاحب المحل التحقق من العمر في الإعدادات، تعرض شاشة البيع تنبيهاً قبل إتمام البيع. الالتزام بأنظمة بيع منتجات التبغ في بلدك مسؤولية المحل.',
  },
];

export default async function HelpPage() {
  const { store } = await requireStore();
  const guides = GUIDES.filter((guide) => can(store, guide.permission));

  return (
    <>
      <PageHeader title="المساعدة" description="أدلة سريعة للمهام اليومية وإجابات الأسئلة الشائعة" />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {guides.length > 0 && (
            <section aria-labelledby="guides-title" className="grid gap-3 sm:grid-cols-2">
              <h2 id="guides-title" className="sr-only">
                أدلة المهام
              </h2>
              {guides.map((guide) => {
                const Icon = guide.icon;
                return (
                  <Card key={guide.title} className="flex flex-col">
                    <CardHeader title={guide.title} icon={<Icon className="size-4" />} />
                    <ol className="mt-3 flex-1 list-decimal space-y-1.5 ps-5 text-[12.5px] leading-relaxed text-secondary marker:font-semibold marker:text-tertiary">
                      {guide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    <Link
                      href={guide.href}
                      className="mt-3 inline-flex items-center gap-1.5 self-start text-[12.5px] font-bold text-accent-strong hover:underline"
                    >
                      افتح الصفحة
                      <ArrowLeft className="size-3.5" aria-hidden="true" />
                    </Link>
                  </Card>
                );
              })}
            </section>
          )}

          <Card>
            <CardHeader title="أسئلة شائعة" icon={<BookOpen className="size-4" />} />
            <div className="mt-2 divide-y divide-line-subtle">
              {FAQ.map((item) => (
                <details key={item.question} className="group py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[13.5px] font-semibold text-primary">
                    {item.question}
                    <span
                      className="text-tertiary transition-transform group-open:rotate-45"
                      aria-hidden="true"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-secondary">{item.answer}</p>
                </details>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="اختصارات لوحة المفاتيح" icon={<Keyboard className="size-4" />} />
            <ul className="mt-3 space-y-2.5">
              {SHORTCUTS.map((shortcut) => (
                <li key={shortcut.label} className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[13px] text-primary">{shortcut.label}</span>
                    <span className="block text-[11.5px] text-tertiary">{shortcut.where}</span>
                  </span>
                  <span className="flex shrink-0 gap-1" dir="ltr">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="num rounded border border-line bg-sunken px-1.5 py-0.5 text-[11px] font-semibold text-secondary"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader
              title="تحتاج مساعدة إضافية؟"
              subtitle="فريق الدعم يرد بالعربية"
              icon={<LifeBuoy className="size-4" />}
            />
            <div className="mt-3 space-y-2 text-[13px]">
              <a
                href={`mailto:${env.SUPPORT_EMAIL}`}
                className="flex items-center gap-2 font-semibold text-accent-strong hover:underline"
              >
                <Mail className="size-4" aria-hidden="true" />
                <span className="num">{env.SUPPORT_EMAIL}</span>
              </a>
              {env.SUPPORT_PHONE && (
                <a
                  href={`tel:${env.SUPPORT_PHONE.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 font-semibold text-accent-strong hover:underline"
                >
                  <Phone className="size-4" aria-hidden="true" />
                  <span className="num">{env.SUPPORT_PHONE}</span>
                </a>
              )}
              <p className="flex items-start gap-2 pt-1 text-[12px] leading-relaxed text-tertiary">
                <Receipt className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                عند التواصل اذكر اسم المحل ورقم الفاتورة أو الصفحة التي تواجه فيها المشكلة.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
