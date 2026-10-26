import Link from "next/link";
export default function NotFound() {
  return <section className="empty-state"><span className="eyebrow">404 / NOT FOUND</span><h1>This page is off the print bed.</h1><p className="muted">Return to your calculator to start a new calculation.</p><Link href="/" className="btn btn-primary">Open calculator</Link></section>;
}
