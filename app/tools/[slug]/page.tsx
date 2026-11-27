import Link from "next/link";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Loader } from "@/components/Loader";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
const Workbench = dynamic(() => import("@/components/tools/Workbench").then((m) => m.Workbench));
const PassportSheet = dynamic(() => import("@/components/tools/PassportSheet").then((m) => m.PassportSheet));
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
    <Shell wide={t.slug === "passport-photo"}>
      <section className={`hero toolhero${t.slug === "passport-photo" ? " compact" : ""}`}>
        <Icon slug={t.slug} />
        <h1>{t.name}</h1>
        <p className="lede">{t.blurb}</p>
      </section>
      <Suspense fallback={<Loader compact label="Loading tool…" />}>
        {t.slug === "passport-photo" ? <PassportSheet /> : <Workbench slug={t.slug} />}
      </Suspense>
      <div className="cta"><Link className="btn" href="/" prefetch={false}>All tools</Link></div>
    </Shell>
  );
}
