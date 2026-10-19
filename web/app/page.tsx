import Link from 'next/link';
import {
  ArrowRightIcon,
  BasketIcon,
  CardIcon,
  CheckCircleIcon,
  ClockIcon,
  CoffeeIcon,
  UserIcon,
  WasherIcon,
} from '../components/icons';
import { LiveStatus } from './live-status';

const PROMISES = [
  {
    icon: ClockIcon,
    title: 'Live queue updates',
    text: 'See the real wait before you leave home.',
  },
  {
    icon: CheckCircleIcon,
    title: 'Same-day service',
    text: 'Start and finish your laundry in one visit.',
  },
  {
    icon: CardIcon,
    title: 'Secure payment',
    text: 'Pay online or at the counter.',
  },
  {
    icon: UserIcon,
    title: 'Real support',
    text: 'Our team is on site while you wash.',
  },
];

const SERVICES = [
  {
    href: '/book/self-service',
    title: 'Self-service wash',
    text: 'Choose your machines, see the real wait, and check in ten minutes before your turn.',
    cta: 'Book a wash',
    icon: WasherIcon,
  },
  {
    href: '/book/drop-off',
    title: 'Drop-off laundry',
    text: 'Leave your laundry with our team. We will message you when it is ready to collect.',
    cta: 'See drop-off',
    icon: BasketIcon,
  },
  {
    href: '/book/add-ons',
    title: 'Coffee and drinks',
    text: 'Fresh coffee and cold drinks while your cycle runs.',
    cta: 'View the menu',
    icon: CoffeeIcon,
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Create your account',
    text: 'Save your details once, then book in seconds.',
  },
  {
    n: '02',
    title: 'Choose a service',
    text: 'Pick self-service or drop-off and select what you need.',
  },
  {
    n: '03',
    title: 'Follow the live queue',
    text: 'See when your washer is ready. No hovering.',
  },
  {
    n: '04',
    title: 'Collect and pay',
    text: 'Pay online or in store, then take home fresh laundry.',
  },
];

export default function Home() {
  return (
    <div>
      <section className="grid items-center gap-10 pb-14 pt-4 sm:pb-20 sm:pt-8 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16">
        <div>
          <p className="eyebrow">Self-service laundry</p>
          <h1 className="display mt-4 text-[2.75rem] leading-[1.05] text-ink sm:text-5xl">
            Laundry day,
            <br />
            without the lost hours.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-muted sm:text-lg">
            Reserve a washer, follow the live queue from your phone, and collect fresh laundry the
            same day. Walk in when it suits you, or plan ahead in a few taps.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/register" className="btn">
              Create an account
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Sign in
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">
            Already have a booking?{' '}
            <Link href="/orders" className="font-semibold text-accent hover:underline">
              Track your wash
            </Link>
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-muted sm:grid-cols-3">
            {['Live queue updates', 'Secure online payment', 'Same-day service'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckCircleIcon className="h-4 w-4 shrink-0 text-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <figure className="overflow-hidden rounded-xl border border-line bg-white">
          <img
            src="/images/laundry-flyer.jpg"
            alt="A washing machine with stacks of freshly folded laundry and an iron"
            width={635}
            height={739}
            loading="eager"
            className="h-auto w-full"
          />
          <figcaption className="flex items-center justify-between gap-4 border-t border-line px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a938f]">
                The everyday standard
              </p>
              <p className="display mt-1 text-lg text-ink">Wash, dry, fold. All under one roof.</p>
            </div>
            <WasherIcon className="h-6 w-6 shrink-0 text-accent" />
          </figcaption>
        </figure>
      </section>

      <section className="section-rule py-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="section-rule py-16 sm:py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">What we do</p>
          <h2 className="display mt-3 text-3xl text-ink sm:text-4xl">
            Three ways to get laundry done.
          </h2>
          <p className="mt-4 text-sm leading-7 text-muted sm:text-base">
            Choose the service that fits your day. The queue is shared, so you always know what to
            expect before you leave home.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {SERVICES.map(({ href, title, text, cta, icon: Icon }) => (
            <Link key={title} href={href} className="card card-hover group flex flex-col">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-ink">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted">{text}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent">
                {cta}
                <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section id="how-it-works" className="section-rule py-16 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="display mt-3 text-3xl text-ink sm:text-4xl">
              A calmer laundry day, in four steps.
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-7 text-muted sm:text-base">
              No app to download. No appointment to remember. Just a clear view of your day.
            </p>
            <Link href="/register" className="btn mt-7">
              Create an account
            </Link>
          </div>

          <ol className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
            {STEPS.map(({ n, title, text }) => (
              <li key={n} className="border-t border-line pt-5">
                <span className="display text-2xl text-accent">{n}</span>
                <h3 className="mt-3 font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="live" className="section-rule py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <p className="eyebrow">Live status</p>
            <h2 className="display mt-3 text-3xl text-ink sm:text-4xl">Know before you go.</h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-muted sm:text-base">
              The queue updates through the day, so you can plan around your laundry instead of
              waiting for it. Check the current wait, drop-off availability, and payment options
              before you leave.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/book" className="btn">
                Book a wash
              </Link>
              <Link href="/orders" className="btn btn-ghost">
                Track my wash
              </Link>
            </div>
          </div>
          <LiveStatus />
        </div>
      </section>

      <section className="py-4 sm:py-8">
        <div className="relative overflow-hidden rounded-xl border border-[#0b2e33]">
          <img
            src="/images/laundry-water.jpg"
            alt="Fresh folded towels and a splash of water beside a washing machine"
            width={735}
            height={1070}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[#0b2e33]/75" />
          <div className="relative flex min-h-[340px] items-center px-6 py-12 sm:min-h-[400px] sm:px-12 sm:py-16">
            <div className="max-w-xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">
                Ready when you are
              </p>
              <h2 className="display mt-3 text-3xl text-white sm:text-4xl">
                Fresh clothes. Clear schedule.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/75 sm:text-base">
                Create an account to reserve a washer, follow your cycle, and pay online. It takes
                less than a minute.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/register" className="btn btn-light">
                  Create an account
                </Link>
                <Link href="/login" className="btn btn-outline-light">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
