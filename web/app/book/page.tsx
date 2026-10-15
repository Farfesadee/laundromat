import Link from 'next/link';
import { PageHeader } from '../../components/ui';
import { ArrowRightIcon, BasketIcon, CoffeeIcon, ShirtIcon } from '../../components/icons';

const CARDS = [
  { h: '/book/self-service', t: 'Self-service', d: 'Choose loads, see the live wait, join today\u2019s queue.', Icon: ShirtIcon },
  { h: '/book/drop-off', t: 'Drop-off', d: 'Leave it with us and get a ready time with pickup alerts.', Icon: BasketIcon },
  { h: '/book/add-ons', t: 'Coffee and drinks', d: 'Add something tasty to enjoy while your wash runs.', Icon: CoffeeIcon },
];

export default function Book() {
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader kicker="Booking" title="What would you like?" sub="Today only. The queue opens at 8:00 AM and closes at 7:30 PM." />
      <div className="grid md:grid-cols-3 gap-3">
        {CARDS.map(({ h, t, d, Icon }) => (
          <Link key={t} href={h} className="card card-hover text-center py-8 group">
            <span className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white grid place-items-center shadow-lg group-hover:scale-105 transition">
              <Icon className="w-7 h-7" />
            </span>
            <p className="font-extrabold text-lg mt-3">{t}</p>
            <p className="text-sm text-slate-500 mt-1">{d}</p>
            <p className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 mt-3">
              Continue <ArrowRightIcon className="w-4 h-4" />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
