import Link from 'next/link';
import { PageHeader } from '../../components/ui';
import { BackLink } from '../../components/back-link';
import { ArrowRightIcon, BasketIcon, CoffeeIcon, ShirtIcon } from '../../components/icons';

const CARDS = [
  { h: '/book/self-service', t: 'Self-service', d: 'Choose loads, see the live wait, join today\u2019s queue.', Icon: ShirtIcon },
  { h: '/book/drop-off', t: 'Drop-off', d: 'Leave it with us and get a ready time with pickup alerts.', Icon: BasketIcon },
  { h: '/book/add-ons', t: 'Coffee and drinks', d: 'Add something tasty to enjoy while your wash runs.', Icon: CoffeeIcon },
];

export default function Book() {
  return (
    <div className="max-w-3xl mx-auto">
      <BackLink href="/" label="Back to home" />
      <PageHeader kicker="Booking" title="What would you like?" sub="Today only. The queue opens at 8:00 AM and closes at 7:30 PM." />
      <div className="grid md:grid-cols-3 gap-3">
        {CARDS.map(({ h, t, d, Icon }) => (
          <Link key={t} href={h} className="card card-hover text-center py-8 group">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-white">
              <Icon className="w-7 h-7" />
            </span>
            <p className="font-semibold text-lg mt-3">{t}</p>
            <p className="text-sm text-muted mt-1">{d}</p>
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-accent mt-3">
              Continue <ArrowRightIcon className="w-4 h-4" />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
