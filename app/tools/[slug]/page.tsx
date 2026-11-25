import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { Workbench } from "@/components/tools/Workbench";
import { TOOLS } from "@/lib/tools";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export const generateStaticParams = () => TOOLS.map((t) => ({ slug: t.slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const t = TOOLS.find((x) => x.slug === slug);
  return t ? { title: t.name, description: t.blurb } : {};
}

export default async function ToolPage({ params }: Props) {
  const { slug } = await params;
  const t = TOOLS.find((x) => x.slug === slug);
  if (!t) notFound();
  return (
    <Shell>
      <section className="hero toolhero">
        <Icon slug={t.slug} />
        <h1>{t.name}</h1>
        <p className="lede">{t.blurb}</p>
      </section>
      {t.slug === "passport-photo" ? (
        <>
          <iframe className="embed" src="/passport-sheet.html" title="Passport photo sheet" />
          <p className="hint"><a href="/passport-sheet.html">Open full screen</a> for a larger preview.</p>
        </>
      ) : (
        <Workbench slug={t.slug} />
      )}
      <div className="cta"><Link className="btn" href="/">All tools</Link></div>
    </Shell>
  );
}
