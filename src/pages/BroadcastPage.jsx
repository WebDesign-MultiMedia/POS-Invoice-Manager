import Layout, { PageHeader } from "../components/Layout.jsx";
import { SiteNav } from "../components/NavFab.jsx";
import SMSBroadcast from "../components/SMSBroadcast.jsx";

export default function BroadcastPage() {
  return (
    <Layout blobs={["bg-brand-pink w-72 h-72 -top-10 -left-10 animate-float-slow", "bg-brand-teal w-80 h-80 top-1/2 -right-16 animate-float"]}>
      <SiteNav className="mb-6" />

      <PageHeader title="Text Customers" subtitle="Weekend specials & announcements" />

      <SMSBroadcast className="stagger-in" />
    </Layout>
  );
}
