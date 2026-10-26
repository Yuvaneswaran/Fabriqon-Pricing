import type { SVGProps } from "react";
export function PrecisionMark(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
    <rect x=".5" y=".5" width="39" height="39" rx="10" fill="#142644" stroke="#31517B" />
    <path d="M10 10H30V15H15V20H25V25H15V31H10V10Z" fill="#3B82F6" />
    <path d="M28 21H31V24H28V21ZM22 28H25V31H22V28ZM28 28H31V31H28V28Z" fill="#F8FAFC" />
  </svg>;
}
export function Brand() {
  return <span className="brand"><PrecisionMark className="brand-mark" /><span className="brand-wordmark">FABRIQON<span>STUDIO</span></span></span>;
}
