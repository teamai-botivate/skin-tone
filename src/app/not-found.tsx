import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-serif font-bold text-[#D7BD9B] mb-4">404 — Page Not Found</h1>
      <p className="text-muted-foreground mb-6">The page you are looking for does not exist.</p>
      <Link
        href="/"
        className="px-6 py-2.5 rounded-full bg-[#D7BD9B] text-[#194343] font-medium transition hover:bg-[#D7BD9B]/90"
      >
        Return Home
      </Link>
    </main>
  );
}
