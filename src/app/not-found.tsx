import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container max-w-xl py-24 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">The page you requested does not exist.</p>
      <Link href="/" className={buttonVariants({ className: "mt-6" })}>
        Back to ChainScope
      </Link>
    </div>
  );
}
