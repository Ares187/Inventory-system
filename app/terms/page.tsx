import Link from "next/link";
import content from "./content.json";

export const metadata = {
  title: "Terms and Conditions | Feldryva",
};

export default function TermsPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", lineHeight: 1.65 }}>
      <Link href="/" style={{ color: "var(--action-blue)" }}>Back to Feldryva</Link>
      <article style={{ overflowWrap: "anywhere", whiteSpace: "pre-line" }}>
        {content.map(({ kind, text }, index) => {
          if (kind === "title") return <h1 key={index}>{text}</h1>;
          if (kind === "section") return <h2 key={index}>{text}</h2>;
          if (kind === "heading") return <h3 key={index}>{text}</h3>;
          return <p key={index}>{text}</p>;
        })}
      </article>
    </main>
  );
}
