import { Wordmark } from "@/components/ui";

export function Footer() {
  return (
    <footer
      className="mt-24"
      style={{ borderTop: "1px solid var(--line-1)", padding: "32px 48px" }}
    >
      <div
        className="mx-auto flex items-center justify-between"
        style={{ maxWidth: 1320, color: "var(--fg-3)", fontSize: 12 }}
      >
        <div className="flex items-center gap-3">
          <Wordmark size={14} />
          <span>by Phyo Thant &amp; Sithu Soe</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
