import ThemeToggle from "./ThemeToggle.jsx";

// Shared page chrome: the floating decorative blobs + the centered <main>
// wrapper repeated (with only colors/spacing varying) across all 4 pages.
export default function Layout({ blobs = [], children, mainClassName = "" }) {
  return (
    <>
      <ThemeToggle />
      {blobs.map((cls, i) => (
        <div key={i} className={`blob ${cls}`}></div>
      ))}
      <main className={`relative z-10 flex flex-col items-center px-4 py-10 ${mainClassName}`.trim()}>
        {children}
      </main>
    </>
  );
}

export function PageHeader({ logoSize = "w-16 h-16", title, subtitle, marginBottom = "mb-6" }) {
  return (
    <div className={`flex flex-col items-center ${marginBottom} stagger-in`}>
      <img src="/imgs/BLFM-logo.PNG" alt="logo" className={`${logoSize} object-contain drop-shadow-lg`} />
      <h1 className="font-headings text-2xl sm:text-3xl shimmer-text text-center mt-2">{title}</h1>
      <p className="text-brand-muted/80 text-sm tracking-widest uppercase">{subtitle}</p>
    </div>
  );
}
