import { Link } from "react-router-dom";
export function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm text-primary hover:underline">Go to overview</Link>
    </div>
  );
}
