import {
  ArrowDown,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  Code2,
  Inbox,
  LayoutGrid,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {Link} from 'react-router-dom';

const features = [
  {
    icon: BookOpen,
    title: 'Answers grounded in your knowledge',
    description:
      'Bring your help content together so customers can find useful answers without waiting for your team.',
  },
  {
    icon: SlidersHorizontal,
    title: 'A widget that feels like yours',
    description:
      'Customize the assistant’s appearance, greeting, tone, and instructions to fit your product.',
  },
  {
    icon: Inbox,
    title: 'A clear path to your team',
    description:
      'Review conversations, follow up on support requests, and hand off questions that need a human.',
  },
  {
    icon: BarChart3,
    title: 'Know what is happening',
    description:
      'Track monthly usage and see how your support experience is performing across projects.',
  },
];

const plans = [
  {
    id: 'trial',
    name: 'Trial',
    description: 'A simple way to see if ZIA fits your workflow.',
    price: 'Free',
    period: 'for 14 days',
    features: ['100 messages per month', '1 project', 'Knowledge base and support inbox'],
    action: 'Start your free trial',
    featured: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'More room to support growing teams and products.',
    price: '₹999 / $19',
    period: 'per month · India / other countries · 10,000 messages',
    features: ['Up to 10 projects', 'Remove the widget watermark', 'Analytics and team tools'],
    action: 'Create an account',
    featured: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Flexible capacity for larger support operations.',
    price: '₹4,999 / $99',
    period: 'per month · India / other countries · unlimited messages',
    features: ['Unlimited projects', 'Remove the widget watermark', 'Built for larger teams'],
    action: 'Create an account',
    featured: false,
  },
];

export function LandingScreen() {
  return (
    <div className="min-h-screen overflow-hidden bg-white text-slate-900">
      <header className="relative z-10 border-b border-slate-200/80 bg-white/90">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-200">
              <LayoutGrid size={19} aria-hidden />
            </span>
            ZIA
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
            <a href="#features" className="transition hover:text-slate-950">Features</a>
            <a href="#how-it-works" className="transition hover:text-slate-950">How it works</a>
            <a href="#pricing" className="transition hover:text-slate-950">Pricing</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="hidden rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/signup?plan=trial"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Get started <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative isolate">
          <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_65%_10%,rgba(191,219,254,0.55),transparent_42%),linear-gradient(to_bottom,#f8fbff,white)]" />
          <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.02fr_0.98fr] lg:gap-10 lg:py-32">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/80 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm">
                <Sparkles size={14} aria-hidden />
                Support that scales with your product
              </div>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-slate-950 sm:text-6xl">
                Give every customer a better answer.
                <span className="text-blue-600"> Without the wait.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Turn your help content into an AI support assistant, bring conversations into one inbox, and let your team focus on the questions that need them most.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/signup?plan=trial"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  Start your free 14-day trial <ArrowRight size={16} aria-hidden />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  See how it works <ArrowDown size={15} aria-hidden />
                </a>
              </div>
              <p className="mt-4 text-xs text-slate-500">No long setup. Add a project and start making support yours.</p>
            </div>

            <div className="relative mx-auto w-full max-w-lg">
              <div aria-hidden className="absolute -inset-5 rounded-[2rem] bg-gradient-to-br from-blue-100 via-indigo-50 to-sky-100 blur-2xl" />
              <div className="relative rounded-3xl border border-slate-200 bg-white p-3 shadow-2xl shadow-blue-950/10 sm:p-5">
                <div className="flex items-center justify-between border-b border-slate-100 px-2 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                      <MessageCircle size={19} aria-hidden />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Product support</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="size-1.5 rounded-full bg-emerald-500" />
                        Here to help
                      </p>
                    </div>
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">AI assistant</span>
                </div>
                <div className="space-y-5 px-2 py-6">
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                    Hi! What can I help you find today?
                  </div>
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-3 text-sm leading-6 text-white">
                    How do I add the support widget to my site?
                  </div>
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-6 text-slate-700">
                    Open your project’s <span className="font-semibold text-slate-900">Install</span> page and copy the embed snippet into your site. You can customize the widget before you publish.
                    <div className="mt-3 flex items-center gap-2 border-t border-slate-200 pt-3 text-xs font-medium text-blue-700">
                      <BookOpen size={14} aria-hidden /> Answered from your knowledge
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-400">
                  <span>Ask a question…</span>
                  <span className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <ArrowRight size={14} aria-hidden />
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2 px-1 text-xs text-slate-500">
                  <ShieldCheck size={14} className="text-emerald-600" aria-hidden />
                  Your knowledge, your assistant, your support workflow
                </div>
              </div>
              <div className="absolute -bottom-7 -left-5 hidden items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-xl sm:flex">
                <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <MessagesSquare size={17} aria-hidden />
                </span>
                <span>
                  <span className="block text-xs font-semibold text-slate-900">One shared inbox</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">Conversations in one place</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="scroll-mt-20 border-y border-slate-100 bg-slate-50/70">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-blue-600">One workspace, better support</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Fewer repetitive questions. More time for people.
              </h2>
              <p className="mt-4 leading-7 text-slate-600">
                ZIA helps you make useful answers easier to find and customer conversations easier to manage.
              </p>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({icon: Icon, title, description}) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-950/[0.02]">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                    <Icon size={20} aria-hidden />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
              <div>
                <p className="text-sm font-semibold text-blue-600">Easy to get started</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                  From your knowledge to customer support in three steps.
                </h2>
                <p className="mt-4 leading-7 text-slate-600">
                  Bring the information your team already uses, shape the experience, and add it to your website.
                </p>
              </div>
              <div className="space-y-4">
                {[
                  {icon: Code2, title: 'Create a project', body: 'Set up a workspace for your product or support experience.'},
                  {icon: BookOpen, title: 'Add your knowledge', body: 'Bring in the content your assistant should use to answer questions.'},
                  {icon: SlidersHorizontal, title: 'Customize and install', body: 'Set the tone and appearance, then add the widget to your site.'},
                ].map(({icon: Icon, title, body}, index) => (
                  <div key={title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Icon size={19} aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        <span className="mr-2 text-blue-600">0{index + 1}</span>{title}
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-slate-600">{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-20 bg-slate-950">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-blue-300">Straightforward plans</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Start small. Grow when you’re ready.
              </h2>
              <p className="mt-4 leading-7 text-slate-300">
                Try the product free, then choose the capacity that fits your team.
              </p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col rounded-2xl p-6 sm:p-7 ${
                    plan.featured
                      ? 'border border-blue-400 bg-white shadow-2xl shadow-blue-950/40'
                      : 'border border-white/15 bg-white/[0.06] text-white'
                  }`}
                >
                  {plan.featured && (
                    <span className="absolute -top-3 right-6 rounded-full bg-blue-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                  <h3 className={`text-lg font-semibold ${plan.featured ? 'text-slate-950' : 'text-white'}`}>
                    {plan.name}
                  </h3>
                  <p className={`mt-2 min-h-12 text-sm leading-6 ${plan.featured ? 'text-slate-600' : 'text-slate-300'}`}>
                    {plan.description}
                  </p>
                  <p className={`mt-6 text-2xl font-semibold tracking-tight ${plan.featured ? 'text-slate-950' : 'text-white'}`}>
                    {plan.price}
                  </p>
                  <p className={`mt-1 text-xs ${plan.featured ? 'text-slate-500' : 'text-slate-400'}`}>
                    {plan.period}
                  </p>
                  <ul className={`mt-6 flex-1 space-y-3 border-t pt-6 text-sm ${plan.featured ? 'border-slate-200 text-slate-700' : 'border-white/15 text-slate-200'}`}>
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <Check size={16} className="mt-0.5 shrink-0 text-emerald-500" aria-hidden />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={`/signup?plan=${plan.id}`}
                    className={`mt-7 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                      plan.featured
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-white/20 bg-white/10 text-white hover:bg-white/15'
                    }`}
                  >
                    {plan.action} <ArrowRight size={15} aria-hidden />
                  </Link>
                </article>
              ))}
            </div>
            <p className="mt-8 text-center text-xs leading-5 text-slate-400">
              Paid plan prices are editable launch prices. India is billed in INR through Razorpay; other countries are billed in USD through PayPal. Plan limits shown are based on the current product tiers.
            </p>
          </div>
        </section>

        <section className="bg-blue-600">
          <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Make support easier for everyone.
              </h2>
              <p className="mt-2 text-sm leading-6 text-blue-100">
                See how an AI assistant backed by your knowledge can help your team.
              </p>
            </div>
            <Link
              to="/signup?plan=trial"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50"
            >
              Create your account <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </main>

      <footer className="bg-slate-950">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-7 text-xs text-slate-400 sm:px-8 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/" className="flex items-center gap-2 font-semibold text-white">
            <LayoutGrid size={15} className="text-blue-400" aria-hidden />
            ZIA
          </Link>
          <p>AI-powered support, grounded in what you know.</p>
          <Link to="/login" className="transition hover:text-white">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
