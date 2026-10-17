import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-serif font-bold text-[#194A49] mb-4">404 — Page Not Found</h1>
      <p className="text-[#795548] mb-6">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-full bg-[#D9BC96] text-[#194A49] font-medium transition hover:bg-[#cfaf86] shadow-sm"
      >
        Return Home
      </Link>
    </main>
  );
}
