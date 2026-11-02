import Layout, { PageHeader } from "../components/Layout.jsx";
import NavFab, { NavRow } from "../components/NavFab.jsx";
import SMSBroadcast from "../components/SMSBroadcast.jsx";

export default function BroadcastPage() {
  return (
    <Layout blobs={["bg-brand-pink w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-teal w-80 h-80 top-1/2 -right-16 animate-float"]}>
      <NavRow className="mb-6">
        <NavFab to="/" title="Order form" icon="fa-house" colorClass="text-brand-gold" glowClass="shadow-glow-gold" />
        <NavFab to="/search" title="Search orders" icon="fa-magnifying-glass" colorClass="text-brand-teal" glowClass="shadow-glow-teal" />
        <NavFab to="/pay" title="Pay with Card" icon="fa-credit-card" colorClass="text-brand-cactus" glowClass="shadow-glow-teal" />
      </NavRow>

      <PageHeader title="Text Customers" subtitle="Weekend specials & announcements" />

      <SMSBroadcast className="stagger-in" />
    </Layout>
  );
}
